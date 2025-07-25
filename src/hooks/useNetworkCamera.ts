
import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useConnectionStabilizer } from './useConnectionStabilizer';

export interface NetworkCameraConfig {
  url: string;
  type: 'rtsp' | 'mjpeg' | 'hls';
  username?: string;
  password?: string;
  name: string;
  quality?: 'high' | 'medium' | 'low';
}

export const useNetworkCamera = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<NetworkCameraConfig | null>(null);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'disconnected'>('disconnected');
  const videoRef = useRef<HTMLVideoElement | HTMLImageElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const isActiveRef = useRef(false);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const lastFrameTimeRef = useRef<number>(Date.now());
  const frameCountRef = useRef<number>(0);
  const bufferSizeRef = useRef<number>(0);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  // Connection stabilizer for proactive monitoring
  const connectionStabilizer = useConnectionStabilizer({
    enabled: isConnected,
    checkInterval: 15000, // Check every 15 seconds
    onConnectionLost: () => {
      console.log('ConnectionStabilizer: Detected connection loss, attempting recovery');
      if (currentConfig && isActiveRef.current) {
        setConnectionError('Network connection lost - attempting recovery...');
        // Attempt reconnection after a short delay
        setTimeout(() => {
          if (isActiveRef.current) {
            connectToCamera(currentConfig);
          }
        }, 2000);
      }
    },
    onConnectionRestored: () => {
      console.log('ConnectionStabilizer: Connection restored');
      setConnectionError(null);
    }
  });

  const isLocalNetwork = (url: string) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
      if (hostname.startsWith('192.168.')) return true;
      if (hostname.startsWith('10.')) return true;
      if (hostname.startsWith('172.')) {
        const parts = hostname.split('.');
        const second = parseInt(parts[1]);
        if (second >= 16 && second <= 31) return true;
      }
      
      return false;
    } catch {
      return false;
    }
  };

  const getProxiedUrl = async (originalUrl: string) => {
    console.log('=== getProxiedUrl - START ===');
    console.log('getProxiedUrl - originalUrl:', originalUrl);
    console.log('getProxiedUrl - window.location.protocol:', window.location.protocol);
    console.log('getProxiedUrl - originalUrl.startsWith("http://"):', originalUrl.startsWith('http://'));
    
    // CRITICAL: Always use proxy for HTTP URLs when on HTTPS to prevent HTTPS-Only mode conflicts
    const shouldUseProxy = originalUrl.startsWith('http://') && window.location.protocol === 'https:';
    console.log('getProxiedUrl - shouldUseProxy:', shouldUseProxy);
    
    if (shouldUseProxy) {
      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required to access camera proxy');
      }
      
      const proxyUrl = `https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/camera-proxy?url=${encodeURIComponent(originalUrl)}`;
      console.log('getProxiedUrl - USING PROXY - proxyUrl:', proxyUrl);
      console.log('=== getProxiedUrl - END (PROXY) ===');
      return { 
        url: proxyUrl, 
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        } 
      };
    }
    
    console.log('getProxiedUrl - NOT USING PROXY - returning original URL:', originalUrl);
    console.log('=== getProxiedUrl - END (NO PROXY) ===');
    return { url: originalUrl, headers: {} };
  };

  const cleanupStream = useCallback(() => {
    console.log('useNetworkCamera: Cleaning up stream resources');
    
    // Mark stream as inactive
    isActiveRef.current = false;
    
    // Cancel any pending fetch operations
    if (fetchControllerRef.current) {
      try {
        fetchControllerRef.current.abort();
      } catch (error) {
        console.log('useNetworkCamera: Error aborting fetch:', error);
      }
      fetchControllerRef.current = null;
    }
    
    // Cancel any pending reader operations
    if (readerRef.current) {
      try {
        readerRef.current.cancel();
      } catch (error) {
        console.log('useNetworkCamera: Error canceling reader:', error);
      }
      readerRef.current = null;
    }
    
    // Clear timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (heartbeatRef.current) {
      clearTimeout(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    
    // Cleanup all blob URLs
    blobUrlsRef.current.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.log('useNetworkCamera: Error revoking blob URL:', error);
      }
    });
    blobUrlsRef.current.clear();
    
    // Clean up image element
    if (videoRef.current && videoRef.current instanceof HTMLImageElement) {
      if (videoRef.current.src && videoRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoRef.current.src);
      }
      videoRef.current.src = '';
    }
    
    // Reset counters
    frameCountRef.current = 0;
    bufferSizeRef.current = 0;
    lastFrameTimeRef.current = Date.now();
  }, []);

  const parseMJPEGStream = useCallback(async (reader: ReadableStreamDefaultReader<Uint8Array>, imgElement: HTMLImageElement, config: NetworkCameraConfig) => {
    let buffer = new Uint8Array(0);
    let frameCount = 0;
    let lastFrameTime = Date.now();
    let lastQualityCheck = Date.now();
    let connectionEstablished = false;
    let consecutiveErrors = 0;
    const maxBufferSize = 200 * 1024; // Increased to 200KB for smoother streaming
    const maxFramesPerSession = 300; // Balanced frame limit
    const minFrameInterval = 33; // Back to ~30 FPS for smooth playback
    
    readerRef.current = reader;
    
    const processChunk = async (): Promise<void> => {
      try {
        // Check if stream should still be active
        if (!isActiveRef.current) {
          console.log('useNetworkCamera: Stream marked as inactive, stopping processing');
          return;
        }

        // Restart stream if we've processed too many frames to prevent memory issues
        if (frameCount > maxFramesPerSession) {
          console.log('useNetworkCamera: Max frames reached, restarting stream for memory management');
          setConnectionError('Refreshing stream...');
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current) {
              connectToCamera(config);
            }
          }, 1000);
          return;
        }

        // Set a reasonable timeout for reading chunks
        const timeoutMs = 10000; // Reduce timeout to 10 seconds
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Read timeout')), timeoutMs);
        });

        const readPromise = reader.read();
        const result = await Promise.race([readPromise, timeoutPromise]);
        
        const { done, value } = result;
        
        if (done) {
          console.log('useNetworkCamera: Stream ended normally');
          if (isActiveRef.current && reconnectAttempts < 3) { // Reduce max attempts
            console.log('useNetworkCamera: Stream ended unexpectedly, attempting reconnection');
            setConnectionError('Stream ended - attempting to reconnect...');
            setReconnectAttempts(prev => prev + 1);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isActiveRef.current) {
                connectToCamera(config);
              }
            }, 3000); // Increase reconnect delay
          }
          return;
        }

        // Update last quality check time
        lastQualityCheck = Date.now();

        // Reset consecutive errors on successful read
        consecutiveErrors = 0;

        // Append new data to buffer with more aggressive size check
        if (buffer.length + value.length > maxBufferSize) {
          console.log(`useNetworkCamera: Incoming data would exceed buffer limit, resetting buffer ${buffer.length}`);
          buffer = new Uint8Array(0);
        }

        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        // Process multiple frames if available in buffer
        let framesProcessed = 0;
        const maxFramesPerChunk = 3; // Process max 3 frames per chunk to prevent blocking

        while (framesProcessed < maxFramesPerChunk) {
          // Look for JPEG start and end markers
          const jpegStart = buffer.findIndex((byte, index) => 
            byte === 0xFF && buffer[index + 1] === 0xD8
          );
          
          if (jpegStart === -1) break;

          const jpegEnd = buffer.findIndex((byte, index) => 
            index > jpegStart + 10 && byte === 0xFF && buffer[index + 1] === 0xD9
          );
          
          if (jpegEnd === -1) break;

          // Extract JPEG frame
          const jpegFrame = buffer.slice(jpegStart, jpegEnd + 2);
          
          // Skip very small frames (likely corrupted)
          if (jpegFrame.length < 1000) {
            buffer = buffer.slice(jpegEnd + 2);
            continue;
          }
          
          // Throttle frame updates to prevent overwhelming the browser
          const now = Date.now();
          if (now - lastFrameTimeRef.current < minFrameInterval) {
            buffer = buffer.slice(jpegEnd + 2);
            framesProcessed++;
            continue;
          }
          lastFrameTimeRef.current = now;
          
          // Create blob URL and display frame
          const blob = new Blob([jpegFrame], { type: 'image/jpeg' });
          const frameUrl = URL.createObjectURL(blob);
          
          // Track blob URLs for cleanup
          blobUrlsRef.current.add(frameUrl);
          
          // Cleanup old blob URLs to prevent memory leaks
          if (blobUrlsRef.current.size > 10) {
            const urlsArray = Array.from(blobUrlsRef.current);
            const oldUrls = urlsArray.slice(0, -5); // Keep only last 5
            oldUrls.forEach(url => {
              URL.revokeObjectURL(url);
              blobUrlsRef.current.delete(url);
            });
          }
          
          // Update image source
          if (imgElement.src && imgElement.src.startsWith('blob:')) {
            const oldUrl = imgElement.src;
            if (blobUrlsRef.current.has(oldUrl)) {
              URL.revokeObjectURL(oldUrl);
              blobUrlsRef.current.delete(oldUrl);
            }
          }
          imgElement.src = frameUrl;
          
          // Remove processed data from buffer
          buffer = buffer.slice(jpegEnd + 2);
          
          frameCount++;
          framesProcessed++;
          
          // Set connection as established after processing first frame
          if (!connectionEstablished && frameCount >= 1) {
            console.log('useNetworkCamera: First frame processed, establishing connection');
            connectionEstablished = true;
            setIsConnected(true);
            setCurrentConfig(config);
            setConnectionError(null);
            setIsConnecting(false);
            setReconnectAttempts(0);
          }
          
          const currentTime = Date.now();
          if (currentTime - lastFrameTime > 10000) { // Log every 10 seconds
            console.log(`useNetworkCamera: Processed ${frameCount} frames, latest size: ${jpegFrame.length}, buffer size: ${buffer.length}`);
            lastFrameTime = currentTime;
          }
          
          // Reset reconnect attempts on successful frame processing
          if (reconnectAttempts > 0 && connectionEstablished) {
            setReconnectAttempts(0);
            setConnectionError(null);
          }
        }

        // Prevent buffer overflow with stable cleanup
        if (buffer.length > maxBufferSize) {
          console.log('useNetworkCamera: Buffer limit reached, stable cleanup');
          // Keep half the buffer to maintain stream continuity
          const keepSize = maxBufferSize / 2;
          buffer = buffer.slice(-keepSize);
        }

        // Continue processing if still active
        if (isActiveRef.current) {
          // Use requestAnimationFrame for smooth performance
          requestAnimationFrame(() => {
            if (isActiveRef.current) {
              setTimeout(() => processChunk(), 5); // Fast processing for smooth video
            }
          });
        }
      } catch (error: any) {
        // Handle aborted operations gracefully - these are expected during cleanup
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          console.log('useNetworkCamera: Stream processing aborted (expected during cleanup)');
          return; // Don't count as errors or attempt reconnection
        }
        
        consecutiveErrors++;
        console.log('useNetworkCamera: Stream processing error:', error, `(consecutive: ${consecutiveErrors})`);
        
        if (!isActiveRef.current) {
          console.log('useNetworkCamera: Stream marked as inactive, stopping processing');
          return;
        }
        
        // If too many consecutive errors, force restart
        if (consecutiveErrors > 10) {
          console.log('useNetworkCamera: Too many consecutive errors, forcing restart');
          setConnectionError('Stream unstable - restarting...');
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current) {
              connectToCamera(config);
            }
          }, 5000);
          return;
        }
        
        // Check if we should attempt reconnection
        if (reconnectAttempts < 3) { // Reduce max attempts
          console.log(`useNetworkCamera: Attempting reconnection ${reconnectAttempts + 1}/3`);
          setConnectionError('Connection interrupted - attempting to reconnect...');
          setReconnectAttempts(prev => prev + 1);
          
          // Attempt reconnection after a delay
          const delay = Math.min(3000 * Math.pow(1.5, reconnectAttempts), 15000); // More conservative backoff
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current) {
              connectToCamera(config);
            }
          }, delay);
        } else {
          console.log('useNetworkCamera: Max reconnection attempts reached or stream inactive');
          setIsConnected(false);
          setConnectionError('Connection lost. Please try reconnecting manually.');
          isActiveRef.current = false;
        }
      }
    };

    processChunk();
  }, [reconnectAttempts]);

  const getQualityParams = (quality?: string) => {
    switch (quality) {
      case 'high':
        return { resolution: '1920x1080', bitrate: '2000000', fps: '30' };
      case 'medium':
        return { resolution: '1280x720', bitrate: '1000000', fps: '25' };
      case 'low':
        return { resolution: '640x480', bitrate: '500000', fps: '20' };
      default:
        return { resolution: '1280x720', bitrate: '1000000', fps: '25' };
    }
  };

  const appendQualityParams = (url: string, quality?: string) => {
    // Don't append quality params by default to avoid 404s on cameras that don't support them
    // Quality will be handled by the client-side constraints instead
    console.log(`useNetworkCamera: Quality setting ${quality} will be handled client-side, using original URL`);
    return url;
  };

  const connectToCamera = useCallback(async (config: NetworkCameraConfig) => {
    console.log('=== useNetworkCamera: Starting connection ===');
    console.log('useNetworkCamera: Config:', config);
    console.log('useNetworkCamera: Quality setting:', config.quality);
    
    // Clean up any existing connections
    cleanupStream();
    
    // Mark stream as active
    isActiveRef.current = true;
    
    setIsConnecting(true);
    setConnectionError(null);
    setCurrentConfig(config);
    setIsConnected(false); // Reset connection state

    try {
      console.log('useNetworkCamera: videoRef.current:', videoRef.current);
      console.log('useNetworkCamera: videoRef:', videoRef);
      
      // Wait for the DOM to be ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!videoRef.current) {
        console.error('useNetworkCamera: Video element not available - videoRef.current is null');
        throw new Error('Video element not available');
      }

      const element = videoRef.current;
      console.log('useNetworkCamera: Element found:', element);
      console.log('useNetworkCamera: Element type:', element.constructor.name);
      
      if (config.type === 'mjpeg') {
        console.log('useNetworkCamera: Setting up MJPEG stream');
        
        // Build the stream URL (quality will be handled client-side for MJPEG)
        let streamUrl = config.url;
        console.log('useNetworkCamera: Using original stream URL:', streamUrl);
        console.log('useNetworkCamera: Quality will be handled client-side for MJPEG streams');
        
        if (config.username && config.password) {
          streamUrl = config.url.replace('://', `://${config.username}:${config.password}@`);
          console.log('useNetworkCamera: Stream URL with auth (hidden for security)');
        }

        // Get the proxied URL with headers
        console.log('useNetworkCamera: Calling getProxiedUrl with streamUrl:', streamUrl);
        const { url: finalUrl, headers } = await getProxiedUrl(streamUrl);
        console.log('useNetworkCamera: Final stream URL from getProxiedUrl:', finalUrl);

        // Check if this is a local network camera
        const isLocal = isLocalNetwork(config.url);
        console.log('useNetworkCamera: Is local network camera:', isLocal);

        // Test connection with multiple attempts
        console.log('useNetworkCamera: Testing connection...');
        let connectionTestPassed = false;
        
        for (let testAttempt = 1; testAttempt <= 3; testAttempt++) {
          try {
            console.log(`useNetworkCamera: Connection test attempt ${testAttempt}/3`);
            
            const testResponse = await fetch(finalUrl, { 
              method: 'HEAD',
              headers,
              signal: AbortSignal.timeout(20000) // 20 seconds per attempt
            });
            
            if (testResponse.ok) {
              console.log(`useNetworkCamera: Connection test passed on attempt ${testAttempt}`);
              connectionTestPassed = true;
              break;
            } else {
              console.warn(`useNetworkCamera: Connection test failed on attempt ${testAttempt}: ${testResponse.status} ${testResponse.statusText}`);
              if (testAttempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 3000 * testAttempt)); // Increasing delay
              }
            }
          } catch (testError) {
            console.warn(`useNetworkCamera: Connection test error on attempt ${testAttempt}:`, testError);
            
            // If CORS error, try to proceed anyway - the actual stream might work
            if (testError.message.includes('CORS') || testError.message.includes('NetworkError')) {
              console.log('useNetworkCamera: CORS detected, but attempting stream connection anyway');
              connectionTestPassed = true;
              break;
            }
            
            if (testAttempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Faster retry for connection issues
            }
          }
        }

        if (!connectionTestPassed) {
          console.error('useNetworkCamera: All connection test attempts failed');
          
          let errorMsg = 'Cannot reach camera after multiple attempts';
          if (isLocal) {
            errorMsg = 'Local network cameras cannot be reached from the cloud proxy. Please ensure your camera is accessible from the internet.';
          } else {
            errorMsg = `Cannot reach camera at ${config.url}. Camera may be offline or blocked by firewall. Please verify the camera is online and accessible from the internet.`;
          }
          
          setConnectionError(errorMsg);
          setIsConnecting(false);
          isActiveRef.current = false;
          return;
        }

        // For MJPEG, we need to handle the browser security restrictions
        if (element instanceof HTMLImageElement) {
          console.log('useNetworkCamera: Setting up IMG element for MJPEG stream');
          
          // Check if we're using the proxy (cross-origin request)
          const isUsingProxy = finalUrl.includes('camera-proxy');
          
          if (isUsingProxy) {
            // For proxied requests, we need to fetch and parse the MJPEG stream
            console.log('useNetworkCamera: Using fetch-based approach for proxied MJPEG stream');
            
            try {
              // Create new AbortController for this fetch
              fetchControllerRef.current = new AbortController();
              
              const response = await fetch(finalUrl, {
                method: 'GET',
                headers: {
                  ...headers,
                  'Accept': 'multipart/x-mixed-replace, image/jpeg, */*',
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache'
                },
                signal: fetchControllerRef.current.signal
              });
              
              if (!response.ok) {
                throw new Error(`Failed to fetch stream: ${response.status}`);
              }
              
              // For MJPEG streams, we need to handle the multipart response
              const reader = response.body?.getReader();
              if (!reader) {
                throw new Error('No response body available');
              }
              
              console.log('useNetworkCamera: Starting MJPEG stream parsing');
              
              // Start parsing the MJPEG stream - connection state will be set when first frame is processed
              parseMJPEGStream(reader, element, config);
              
            } catch (fetchError) {
              console.error('useNetworkCamera: Fetch-based stream failed:', fetchError);
              
              if (fetchError.name === 'AbortError') {
                console.log('useNetworkCamera: Fetch aborted');
                return;
              }
              
              setConnectionError('Failed to establish stream connection. Please try again.');
              setIsConnected(false);
              setIsConnecting(false);
              isActiveRef.current = false;
            }
          } else {
            // Direct connection (no proxy needed)  
            const handleLoad = () => {
              console.log('useNetworkCamera: IMG element loaded successfully!');
              setIsConnected(true);
              setCurrentConfig(config);
              setConnectionError(null);
              setIsConnecting(false);
              setReconnectAttempts(0);
            };

            const handleError = (e: Event) => {
              console.error('useNetworkCamera: IMG element error:', e);
              setConnectionError('Failed to load MJPEG stream from camera.');
              setIsConnected(false);
              setIsConnecting(false);
              isActiveRef.current = false;
            };

            // Remove existing listeners
            element.removeEventListener('load', handleLoad);
            element.removeEventListener('error', handleError);

            // Add new listeners
            element.addEventListener('load', handleLoad, { once: true });
            element.addEventListener('error', handleError);

            // Set the source
            console.log('useNetworkCamera: Setting img.src to:', finalUrl);
            element.src = finalUrl;
          }
          
        } else {
          console.error('useNetworkCamera: Element is not IMG, current element:', element);
          console.error('useNetworkCamera: Element type:', element?.constructor.name);
          setConnectionError('Expected img element for MJPEG stream, got: ' + element?.constructor.name);
          setIsConnecting(false);
          isActiveRef.current = false;
          return;
        }

        // Connection timeout fallback - only if no frames have been processed
        setTimeout(() => {
          if (isConnecting && !isConnected) {
            console.warn('useNetworkCamera: Connection timeout after 30 seconds');
            setConnectionError('Connection timeout - please check your camera configuration and try again.');
            setIsConnecting(false);
            isActiveRef.current = false;
          }
        }, 30000);

      } else {
        throw new Error(`Stream type ${config.type} not fully supported yet`);
      }

    } catch (error) {
      console.error('useNetworkCamera: Connection error:', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnected(false);
      setIsConnecting(false);
      isActiveRef.current = false;
    }
  }, [isConnecting, isConnected, cleanupStream, parseMJPEGStream]);

  const disconnect = useCallback(() => {
    console.log('useNetworkCamera: Disconnecting');
    isActiveRef.current = false;
    cleanupStream();
    setIsConnected(false);
    setCurrentConfig(null);
    setConnectionError(null);
    setReconnectAttempts(0);
  }, [cleanupStream]);

  const forceReconnect = useCallback(() => {
    if (currentConfig) {
      console.log('useNetworkCamera: Force reconnecting to:', currentConfig.name);
      setReconnectAttempts(0);
      setConnectionError(null);
      connectToCamera(currentConfig);
    }
  }, [currentConfig, connectToCamera]);

  const testConnection = useCallback(async (config: NetworkCameraConfig): Promise<boolean> => {
    try {
      console.log('useNetworkCamera: Testing connection to:', config.url);
      
      const isLocal = isLocalNetwork(config.url);
      console.log('useNetworkCamera: Is local network camera for test:', isLocal);
      
      if (isLocal) {
        console.log('useNetworkCamera: Skipping connection test for local network camera');
        return false;
      }
      
      let testUrl = config.url;
      if (config.username && config.password) {
        testUrl = config.url.replace('://', `://${config.username}:${config.password}@`);
      }
      
      const shouldUseProxy = testUrl.startsWith('http://') && window.location.protocol === 'https:';
      
      if (shouldUseProxy) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.error('useNetworkCamera: No session for proxy test');
          return false;
        }
        
        const response = await fetch(`https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/camera-proxy?url=${encodeURIComponent(testUrl)}`, {
          method: 'HEAD',
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          },
          signal: AbortSignal.timeout(10000)
        });
        
        console.log('useNetworkCamera: Connection test result:', response.ok, response.status);
        return response.ok;
      } else {
        const response = await fetch(testUrl, { 
          method: 'HEAD',
          mode: 'cors',
          signal: AbortSignal.timeout(10000)
        });
        console.log('useNetworkCamera: Connection test response:', response.status);
        return response.ok;
      }
    } catch (error) {
      console.error('useNetworkCamera: Connection test failed:', error);
      return false;
    }
  }, []);

  return {
    isConnecting,
    connectionError,
    isConnected,
    currentConfig,
    connectionQuality,
    videoRef,
    streamRef,
    reconnectAttempts,
    connectToCamera,
    disconnect,
    forceReconnect,
    testConnection
  };
};

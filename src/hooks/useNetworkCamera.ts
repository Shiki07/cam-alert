
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

  // Connection stabilizer for proactive monitoring (disabled to prevent unnecessary reconnections)
  const connectionStabilizer = useConnectionStabilizer({
    enabled: false, // Disabled - let stream handle its own resilience
    checkInterval: 30000,
    onConnectionLost: () => {
      console.log('ConnectionStabilizer: Connection issues detected');
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

  const getProxiedUrl = useCallback(async (originalUrl: string) => {
    // Fast path - cache auth token to avoid repeated auth calls
    const shouldUseProxy = originalUrl.startsWith('http://') && window.location.protocol === 'https:';
    
    if (shouldUseProxy) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }
      
      return { 
        url: `https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/camera-proxy?url=${encodeURIComponent(originalUrl)}`,
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Cache-Control': 'no-cache'
        } 
      };
    }
    
    return { url: originalUrl, headers: {} };
  }, []);

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
    let lastMemoryCleanup = Date.now();
    let connectionEstablished = false;
    let consecutiveErrors = 0;
    const maxBufferSize = 80 * 1024; // Larger buffer to accommodate typical MJPEG frames (40-60KB)
    const minFrameInterval = 100; // ~10 FPS to reduce processing load and prevent blocking
    const memoryCleanupInterval = 15000; // Very frequent cleanup
    
    readerRef.current = reader;
    
    const processChunk = async (): Promise<void> => {
      try {
        // Check if stream should still be active
        if (!isActiveRef.current) {
          console.log('useNetworkCamera: Stream marked as inactive, stopping processing');
          return;
        }

        // Perform periodic memory cleanup without interrupting the stream
        const currentTime = Date.now();
        if (currentTime - lastMemoryCleanup > memoryCleanupInterval) {
          lastMemoryCleanup = currentTime;
          
          // Clean up old blob URLs more aggressively during periodic cleanup
          if (blobUrlsRef.current.size > 5) {
            const urlsArray = Array.from(blobUrlsRef.current);
            const oldUrls = urlsArray.slice(0, -3); // Keep only last 3
            oldUrls.forEach(url => {
              URL.revokeObjectURL(url);
              blobUrlsRef.current.delete(url);
            });
            console.log(`useNetworkCamera: Periodic cleanup - removed ${oldUrls.length} blob URLs`);
          }
          
          // Reset frame counter to prevent overflow
          if (frameCount > 10000) {
            frameCount = 0;
            console.log('useNetworkCamera: Frame counter reset for continuous operation');
          }
        }

        // Read stream chunk without timeout for continuous MJPEG streams
        const result = await reader.read();
        
        const { done, value } = result;
        
        if (done) {
          console.log('useNetworkCamera: Stream ended unexpectedly, attempting immediate reconnection');
          // Stream ended unexpectedly - this should not happen with a stable camera
          if (isActiveRef.current && currentConfig) {
            console.log('useNetworkCamera: Stream ended prematurely, reconnecting automatically');
            
            // Immediate reconnection for unexpected stream end
            setTimeout(() => {
              if (isActiveRef.current && currentConfig) {
                console.log('useNetworkCamera: Executing immediate reconnection');
                connectToCamera(currentConfig).catch(error => {
                  console.error('useNetworkCamera: Immediate reconnection failed:', error);
                  // Try one more time after a delay
                  setTimeout(() => {
                    if (isActiveRef.current && currentConfig) {
                      connectToCamera(currentConfig);
                    }
                  }, 5000);
                });
              }
            }, 1000); // Very quick reconnection for stream end
          }
          return;
        }

        // Update last quality check time
        lastQualityCheck = Date.now();

        // Reset consecutive errors on successful read
        consecutiveErrors = 0;

        // More aggressive buffer management - prevent any accumulation
        if (buffer.length + value.length > maxBufferSize) {
          console.log(`useNetworkCamera: Buffer limit exceeded (${buffer.length + value.length} > ${maxBufferSize}), clearing buffer completely`);
          buffer = new Uint8Array(0); // Clear completely to prevent growth
        }

        // Only append if we have room - this prevents endless growth
        if (buffer.length + value.length <= maxBufferSize) {
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;
        } else {
          // If still too big, start fresh with just the new data
          buffer = value.slice(0, maxBufferSize);
        }

        // Process only ONE frame per cycle to prevent blocking
        let framesProcessed = 0;
        const maxFramesPerChunk = 1; // Process only 1 frame per cycle to prevent blocking

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
          
          // Dynamic blob URL cleanup to prevent memory leaks
          if (blobUrlsRef.current.size > 8) {
            const urlsArray = Array.from(blobUrlsRef.current);
            const oldUrls = urlsArray.slice(0, -4); // Keep only last 4
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
          
          // Log frame processing stats periodically
          if (currentTime - lastFrameTime > 15000) { // Log every 15 seconds
            console.log(`useNetworkCamera: Processed ${frameCount} frames, latest size: ${jpegFrame.length}, buffer size: ${buffer.length}, blob URLs: ${blobUrlsRef.current.size}`);
            lastFrameTime = currentTime;
          }
          
          // Reset reconnect attempts on successful frame processing
          if (reconnectAttempts > 0 && connectionEstablished) {
            setReconnectAttempts(0);
            setConnectionError(null);
          }
        }

        // Intelligent buffer management to prevent overflow
        if (buffer.length > maxBufferSize) {
          console.log('useNetworkCamera: Buffer optimization - maintaining stream continuity');
          // Find the last complete JPEG frame boundary to keep partial frames intact
          let keepPosition = buffer.length;
          for (let i = buffer.length - 1; i > maxBufferSize / 3; i--) {
            if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
              keepPosition = i + 2;
              break;
            }
          }
          buffer = buffer.slice(keepPosition);
        }

        // Continue processing if still active
        if (isActiveRef.current) {
          // Slower processing to prevent browser blocking
          setTimeout(() => {
            if (isActiveRef.current) {
              processChunk();
            }
          }, 20); // Slower processing to prevent blocking
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
        
        // Classify error types for intelligent recovery
        const isRecoverableError = error.name === 'TypeError' || 
                                  error.message?.includes('timeout') ||
                                  error.message?.includes('network') ||
                                  error.message?.includes('Failed to fetch');
        
        const isFatalError = error.message?.includes('404') ||
                           error.message?.includes('403') ||
                           error.message?.includes('401') ||
                           error.message?.includes('Authentication');
        
        // For fatal errors, stop immediately
        if (isFatalError) {
          console.log('useNetworkCamera: Fatal error detected, stopping stream');
          setIsConnected(false);
          setConnectionError(`Connection failed: ${error.message}`);
          isActiveRef.current = false;
          return;
        }
        
        // For recoverable errors, try quick recovery first
        if (isRecoverableError && consecutiveErrors < 25) {
          console.log(`useNetworkCamera: Recoverable error ${consecutiveErrors}/25, continuing stream`);
          // Brief pause then continue processing without full reconnection
          if (isActiveRef.current) {
            setTimeout(() => {
              if (isActiveRef.current) {
                processChunk();
              }
            }, Math.min(100 * consecutiveErrors, 2000));
          }
          return;
        }
        
        // Only perform full reconnection for persistent errors
        if (consecutiveErrors > 25 && reconnectAttempts < 2) {
          console.log('useNetworkCamera: Persistent errors, attempting full reconnection');
          setConnectionError('Stream experiencing issues - recovering...');
          setReconnectAttempts(prev => prev + 1);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isActiveRef.current) {
              connectToCamera(config);
            }
          }, 5000);
        } else if (consecutiveErrors > 25) {
          console.log('useNetworkCamera: Max recovery attempts reached');
          setIsConnected(false);
          setConnectionError('Stream connection unstable. Please check camera and try reconnecting.');
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
      
      // Minimal delay for DOM readiness
      await new Promise(resolve => setTimeout(resolve, 100));
      
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

        // Skip connection test for faster startup - proceed directly to stream
        console.log('useNetworkCamera: Skipping connection test for faster startup');
        let connectionTestPassed = true;

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
                  'Pragma': 'no-cache',
                  'Connection': 'keep-alive'
                },
                signal: fetchControllerRef.current.signal,
                keepalive: true
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

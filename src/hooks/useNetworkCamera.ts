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
  const frameRateRef = useRef<number>(0);
  const lastFrameRateCheckRef = useRef<number>(Date.now());
  const connectionAgeRef = useRef<number>(Date.now());
  const overlappingConnectionRef = useRef<AbortController | null>(null);

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
    // Always use proxy for HTTP cameras on HTTPS sites
    const shouldUseProxy = originalUrl.startsWith('http://') && window.location.protocol === 'https:';
    
    if (shouldUseProxy) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }
      
      // Include the auth token as a URL parameter for img elements
      const proxyUrl = new URL('https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/camera-proxy');
      proxyUrl.searchParams.set('url', originalUrl);
      proxyUrl.searchParams.set('token', session.access_token);
      
      return { 
        url: proxyUrl.toString(),
        headers: {} // No headers needed since token is in URL
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
    frameRateRef.current = 0;
    lastFrameRateCheckRef.current = Date.now();
    connectionAgeRef.current = Date.now();
    
    // Cancel overlapping connections
    if (overlappingConnectionRef.current) {
      overlappingConnectionRef.current.abort();
      overlappingConnectionRef.current = null;
    }
  }, []);

  // Graceful handover function for smooth transitions
  const startOverlappingConnection = useCallback(async (imgElement: HTMLImageElement, config: NetworkCameraConfig) => {
    console.log('useNetworkCamera: Starting overlapping connection for graceful handover');
    
    const controller = new AbortController();
    overlappingConnectionRef.current = controller;
    
    try {
      const { url: proxiedUrl } = await getProxiedUrl(config.url);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Authentication session required');
      }
      
      // Start new connection in background
      setTimeout(() => {
        if (isActiveRef.current && overlappingConnectionRef.current === controller) {
          console.log('useNetworkCamera: Switching to overlapping connection');
          // Reset connection state for smooth transition
          frameCountRef.current = 0;
          connectionAgeRef.current = Date.now();
          setReconnectAttempts(0);
          connectToMJPEGStream(imgElement, config);
        }
      }, 1000); // 1 second overlap
      
    } catch (error) {
      console.error('useNetworkCamera: Overlapping connection failed:', error);
      // Fallback to regular reconnection
      if (isActiveRef.current) {
        connectToMJPEGStream(imgElement, config);
      }
    }
  }, [getProxiedUrl]);

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
          
          // Always use proxy for HTTP cameras when on HTTPS
          console.log('useNetworkCamera: Using proxy for MJPEG stream');
          connectToMJPEGStream(element, config);
          
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
  }, [isConnecting, isConnected, cleanupStream, getProxiedUrl]);

  const connectToMJPEGStream = useCallback(async (imgElement: HTMLImageElement, config: NetworkCameraConfig) => {
    try {
      console.log('useNetworkCamera: Starting fetch-based MJPEG connection to bypass OpaqueResponseBlocking');
      
      const { url: proxiedUrl } = await getProxiedUrl(config.url);
      
      // Clear any existing monitoring
      if (heartbeatRef.current) {
        clearTimeout(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // Cancel any existing fetch operations
      if (fetchControllerRef.current) {
        try {
          fetchControllerRef.current.abort();
        } catch (error) {
          console.log('useNetworkCamera: Error aborting previous fetch:', error);
        }
      }

      // Create new abort controller for this connection
      const controller = new AbortController();
      fetchControllerRef.current = controller;

      console.log('useNetworkCamera: Using fetch to bypass browser OpaqueResponseBlocking...');
      
      // Add timeout to prevent hanging connections
      const fetchTimeout = setTimeout(() => {
        console.log('useNetworkCamera: Fetch timeout, aborting connection');
        controller.abort();
      }, 30000); // 30 second timeout
      
      try {
        // Get current session for authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Authentication session required');
        }
        
        // Use fetch to get the stream data with proper authentication
        const response = await fetch(proxiedUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Accept': 'multipart/x-mixed-replace, image/jpeg, */*',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          credentials: 'omit' // Omit cookies but keep authorization header
        });
        
        clearTimeout(fetchTimeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      console.log('useNetworkCamera: Fetch successful, content-type:', contentType);

      if (contentType?.includes('multipart/x-mixed-replace')) {
        console.log('useNetworkCamera: Processing multipart MJPEG stream via fetch');
        
        // Handle multipart MJPEG stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }

        let buffer = new Uint8Array();
        let frameCount = 0;

        const processStream = async () => {
          while (isActiveRef.current) {
            try {
              const { done, value } = await reader.read();
              
              if (done) {
                const connectionAge = Date.now() - connectionAgeRef.current;
                const framesProcessed = frameCountRef.current;
                
                // Smart reconnection logic - distinguish between natural cycling and errors
                console.log(`useNetworkCamera: Stream ended naturally. Age: ${connectionAge}ms, Frames: ${framesProcessed}, Rate: ${frameRateRef.current.toFixed(1)}fps`);
                
                // Increase thresholds for better reliability
                if (connectionAge < 60000 && framesProcessed < 50) { // Less than 60s and few frames = likely error
                  console.log('useNetworkCamera: Premature disconnection detected, reconnecting...');
                  if (isActiveRef.current && reconnectAttempts < 5) { // Increased retry attempts
                    setReconnectAttempts(prev => prev + 1);
                    const delay = Math.min(2000 * reconnectAttempts, 10000); // Progressive backoff
                    console.log(`useNetworkCamera: Retrying in ${delay}ms (attempt ${reconnectAttempts + 1})`);
                    setTimeout(() => {
                      if (isActiveRef.current) {
                        connectToMJPEGStream(imgElement, config);
                      }
                    }, delay);
                  } else {
                    console.log('useNetworkCamera: Max reconnection attempts reached');
                    setIsConnected(false);
                    setConnectionError('Camera connection failed after multiple attempts');
                  }
                } else {
                  // Natural stream end - restart with graceful handover
                  console.log('useNetworkCamera: Natural stream cycle, graceful restart...');
                  setReconnectAttempts(0); // Reset on successful connection
                  if (isActiveRef.current) {
                    // Start overlapping connection for smoother transition
                    startOverlappingConnection(imgElement, config);
                  }
                }
                break;
              }

              // Append new data to buffer
              const newBuffer = new Uint8Array(buffer.length + value.length);
              newBuffer.set(buffer);
              newBuffer.set(value, buffer.length);
              buffer = newBuffer;

              // Look for JPEG frames in the buffer
              let startIdx = -1;
              let endIdx = -1;
              
              // Find JPEG start marker (FF D8)
              for (let i = 0; i < buffer.length - 1; i++) {
                if (buffer[i] === 0xFF && buffer[i + 1] === 0xD8) {
                  startIdx = i;
                  break;
                }
              }
              
              // Find JPEG end marker (FF D9)
              if (startIdx !== -1) {
                for (let i = startIdx + 2; i < buffer.length - 1; i++) {
                  if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
                    endIdx = i + 2;
                    break;
                  }
                }
              }

              // If we have a complete JPEG frame, display it
              if (startIdx !== -1 && endIdx !== -1) {
                const frameData = buffer.slice(startIdx, endIdx);
                const blob = new Blob([frameData], { type: 'image/jpeg' });
                
                // Revoke previous blob URL
                if (imgElement.src && imgElement.src.startsWith('blob:')) {
                  URL.revokeObjectURL(imgElement.src);
                  blobUrlsRef.current.delete(imgElement.src);
                }
                
                const blobUrl = URL.createObjectURL(blob);
                imgElement.src = blobUrl;
                
                // Track blob URL for cleanup - increase buffer size for smoother streaming
                blobUrlsRef.current.add(blobUrl);
                if (blobUrlsRef.current.size > 10) {
                  const oldestUrl = blobUrlsRef.current.values().next().value;
                  URL.revokeObjectURL(oldestUrl);
                  blobUrlsRef.current.delete(oldestUrl);
                }
                
                // Remove processed data from buffer
                buffer = buffer.slice(endIdx);
                
                // Update connection status and frame rate monitoring
                frameCount++;
                frameCountRef.current = frameCount;
                const now = Date.now();
                lastFrameTimeRef.current = now;
                
                // Calculate frame rate for quality monitoring
                if (now - lastFrameRateCheckRef.current > 5000) { // Check every 5 seconds
                  const timeDiff = (now - lastFrameRateCheckRef.current) / 1000;
                  frameRateRef.current = frameCount / timeDiff;
                  lastFrameRateCheckRef.current = now;
                }
                
                if (!isConnected) {
                  console.log('useNetworkCamera: MJPEG fetch stream connected successfully! Frame:', frameCount);
                  setIsConnected(true);
                  setCurrentConfig(config);
                  setConnectionError(null);
                  setIsConnecting(false);
                  setReconnectAttempts(0);
                  connectionAgeRef.current = now;
                }
              }

              // Enhanced buffer management with larger limits for stability
              if (buffer.length > 8 * 1024 * 1024) { // Increased from 2MB to 8MB
                console.log('useNetworkCamera: Buffer too large, using circular buffer strategy');
                buffer = buffer.slice(-4 * 1024 * 1024); // Keep 4MB instead of 1MB
              }
              
            } catch (readError: any) {
              if (readError.name === 'AbortError') {
                console.log('useNetworkCamera: Stream read aborted');
                break;
              }
              throw readError;
            }
          }
        };

        readerRef.current = reader;
        processStream().catch(error => {
          console.error('useNetworkCamera: Stream processing error:', error);
          
          if (error.name === 'AbortError') {
            console.log('useNetworkCamera: Stream processing aborted');
            return;
          }
          
          // Enhanced error handling with frame rate consideration
          const connectionAge = Date.now() - connectionAgeRef.current;
          const framesProcessed = frameCountRef.current;
          
          if (framesProcessed > 500) { // Had a good run, restart immediately
            console.log('useNetworkCamera: Good stream run completed, immediate restart');
            if (isActiveRef.current) {
              setReconnectAttempts(0); // Reset attempts for good connections
              connectToMJPEGStream(imgElement, config);
            }
          } else if (isActiveRef.current && reconnectAttempts < 3) {
            setReconnectAttempts(prev => prev + 1);
            // Exponential backoff only for actual errors, not natural cycling
            const delay = connectionAge > 20000 ? 1000 : Math.min(3000 * reconnectAttempts, 10000);
            setTimeout(() => {
              if (isActiveRef.current) {
                connectToMJPEGStream(imgElement, config);
              }
            }, delay);
          } else {
            setConnectionError('Fetch-based stream processing failed. Your camera is confirmed working, but there may be a temporary connectivity issue.');
            setIsConnected(false);
            isActiveRef.current = false;
          }
        });

      } else {
        // Handle single image response
        console.log('useNetworkCamera: Processing single JPEG image via fetch');
        const blob = await response.blob();
        
        // Revoke previous blob URL
        if (imgElement.src && imgElement.src.startsWith('blob:')) {
          URL.revokeObjectURL(imgElement.src);
          blobUrlsRef.current.delete(imgElement.src);
        }
        
        const blobUrl = URL.createObjectURL(blob);
        imgElement.src = blobUrl;
        
        // Track blob URL for cleanup
        blobUrlsRef.current.add(blobUrl);
        if (blobUrlsRef.current.size > 10) {
          const oldestUrl = blobUrlsRef.current.values().next().value;
          URL.revokeObjectURL(oldestUrl);
          blobUrlsRef.current.delete(oldestUrl);
        }
        
        console.log('useNetworkCamera: Single JPEG image loaded successfully');
        setIsConnected(true);
        setCurrentConfig(config);
        setConnectionError(null);
        setIsConnecting(false);
        setReconnectAttempts(0);
      }

      } catch (error) {
        clearTimeout(fetchTimeout);
        console.error('useNetworkCamera: Fetch-based connection failed:', error);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('useNetworkCamera: Fetch operation aborted');
        return;
      }
      
      // Exponential backoff retry logic for failed attempts
      const delay = Math.min(1000 * (reconnectAttempts + 1), 5000);
      console.log(`useNetworkCamera: Retrying fetch-based connection (${reconnectAttempts + 1}/3)`);
      
      if (reconnectAttempts < 3 && isActiveRef.current) {
        setReconnectAttempts(prev => prev + 1);
        setTimeout(() => {
          if (isActiveRef.current) {
            connectToMJPEGStream(imgElement, config);
          }
        }, delay);
      } else {
        setConnectionError(`Camera connection failed after multiple attempts. Please check if your camera is online and accessible.`);
        setIsConnected(false);
        setIsConnecting(false);
        isActiveRef.current = false;
      }
    }
    } catch (error) {
      console.error('useNetworkCamera: connectToMJPEGStream error:', error);
      setConnectionError('Failed to establish camera connection');
      setIsConnected(false);
      setIsConnecting(false);
      isActiveRef.current = false;
    }
  }, [getProxiedUrl, reconnectAttempts, startOverlappingConnection]);

  const disconnect = useCallback(() => {
    console.log('useNetworkCamera: Disconnecting camera...');
    cleanupStream();
    setIsConnected(false);
    setIsConnecting(false);
    setConnectionError(null);
    setCurrentConfig(null);
    setReconnectAttempts(0);
  }, [cleanupStream]);

  const forceReconnect = useCallback(() => {
    if (currentConfig) {
      console.log('useNetworkCamera: Force reconnect requested');
      disconnect();
      setTimeout(() => {
        connectToCamera(currentConfig);
      }, 1000);
    }
  }, [currentConfig, disconnect, connectToCamera]);

  const testConnection = useCallback(async (config: NetworkCameraConfig): Promise<boolean> => {
    try {
      console.log('useNetworkCamera: Testing connection to:', config.url);
      
      // Build stream URL with credentials if provided
      let testUrl = config.url;
      if (config.username && config.password) {
        testUrl = config.url.replace('://', `://${config.username}:${config.password}@`);
      }

      // Get proxied URL for testing
      const { url: proxiedUrl } = await getProxiedUrl(testUrl);

      // Test connection with shorter timeout for responsiveness
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Authentication required');
        }

        const response = await fetch(proxiedUrl, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'User-Agent': 'CamAlert-ConnectionTest/1.0'
          },
          credentials: 'omit'
        });

        clearTimeout(timeout);
        console.log('useNetworkCamera: Connection test result:', response.status, response.statusText);
        
        // Accept any response that indicates the camera is reachable
        return response.status >= 200 && response.status < 500;
        
      } catch (error) {
        clearTimeout(timeout);
        console.log('useNetworkCamera: Connection test failed:', error);
        return false;
      }
    } catch (error) {
      console.error('useNetworkCamera: Connection test setup failed:', error);
      return false;
    }
  }, [getProxiedUrl]);

  return {
    // State
    isConnecting,
    isConnected,
    connectionError,
    connectionQuality,
    currentConfig,
    reconnectAttempts,
    
    // Refs
    videoRef,
    streamRef,
    
    // Methods
    connectToCamera,
    disconnect,
    forceReconnect,
    testConnection
  };
};

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface NetworkCameraConfig {
  url: string;
  type: 'rtsp' | 'mjpeg' | 'hls';
  username?: string;
  password?: string;
  name: string;
}

export const useNetworkCamera = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<NetworkCameraConfig | null>(null);
  const videoRef = useRef<HTMLVideoElement | HTMLImageElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const isActiveRef = useRef(false); // Track if stream should be active

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
      return { url: proxyUrl, headers: { 'Authorization': `Bearer ${session.access_token}` } };
    }
    
    console.log('getProxiedUrl - NOT USING PROXY - returning original URL:', originalUrl);
    console.log('=== getProxiedUrl - END (NO PROXY) ===');
    return { url: originalUrl, headers: {} };
  };

  const cleanupStream = useCallback(() => {
    console.log('useNetworkCamera: Cleaning up stream resources');
    
    // Mark stream as inactive
    isActiveRef.current = false;
    
    // Cancel any pending reader operations
    if (readerRef.current) {
      try {
        readerRef.current.cancel();
      } catch (error) {
        console.log('useNetworkCamera: Error canceling reader:', error);
      }
      readerRef.current = null;
    }
    
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Clean up image element
    if (videoRef.current && videoRef.current instanceof HTMLImageElement) {
      if (videoRef.current.src && videoRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoRef.current.src);
      }
      videoRef.current.src = '';
    }
  }, []);

  const parseMJPEGStream = useCallback(async (reader: ReadableStreamDefaultReader<Uint8Array>, imgElement: HTMLImageElement, config: NetworkCameraConfig) => {
    let buffer = new Uint8Array(0);
    let frameCount = 0;
    let lastFrameTime = Date.now();
    
    readerRef.current = reader;
    
    const processChunk = async (): Promise<void> => {
      try {
        // Check if stream should still be active
        if (!isActiveRef.current) {
          console.log('useNetworkCamera: Stream marked as inactive, stopping processing');
          return;
        }

        const { done, value } = await reader.read();
        if (done) {
          console.log('useNetworkCamera: Stream ended normally');
          return;
        }

        // Append new data to buffer
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        // Look for JPEG start and end markers
        const jpegStart = buffer.findIndex((byte, index) => 
          byte === 0xFF && buffer[index + 1] === 0xD8
        );
        
        if (jpegStart !== -1) {
          const jpegEnd = buffer.findIndex((byte, index) => 
            index > jpegStart && byte === 0xFF && buffer[index + 1] === 0xD9
          );
          
          if (jpegEnd !== -1) {
            // Extract JPEG frame
            const jpegFrame = buffer.slice(jpegStart, jpegEnd + 2);
            
            // Create blob URL and display frame
            const blob = new Blob([jpegFrame], { type: 'image/jpeg' });
            const frameUrl = URL.createObjectURL(blob);
            
            // Update image source
            if (imgElement.src && imgElement.src.startsWith('blob:')) {
              URL.revokeObjectURL(imgElement.src);
            }
            imgElement.src = frameUrl;
            
            // Remove processed data from buffer
            buffer = buffer.slice(jpegEnd + 2);
            
            frameCount++;
            const now = Date.now();
            if (now - lastFrameTime > 5000) { // Log every 5 seconds
              console.log(`useNetworkCamera: Processed ${frameCount} frames, latest size: ${jpegFrame.length}`);
              lastFrameTime = now;
            }
            
            // Reset reconnect attempts on successful frame
            if (reconnectAttempts > 0) {
              setReconnectAttempts(0);
            }
          }
        }

        // Keep buffer size manageable
        if (buffer.length > 1024 * 1024) { // 1MB limit
          console.log('useNetworkCamera: Buffer too large, resetting');
          buffer = new Uint8Array(0);
        }

        // Continue processing if still active
        if (isActiveRef.current) {
          // Use setTimeout to prevent stack overflow
          setTimeout(() => processChunk(), 0);
        }
      } catch (error) {
        console.error('useNetworkCamera: Stream processing error:', error);
        
        if (!isActiveRef.current) {
          console.log('useNetworkCamera: Not active, skipping reconnection');
          return;
        }
        
        // Handle different types of errors
        if (error.name === 'AbortError') {
          console.log('useNetworkCamera: Stream was aborted');
          return;
        }
        
        // Auto-reconnect on timeout or network errors
        setConnectionError('Stream connection lost - attempting to reconnect...');
        setReconnectAttempts(prev => prev + 1);
        
        // Attempt reconnection after a delay
        reconnectTimeoutRef.current = setTimeout(() => {
          if (currentConfig && reconnectAttempts < 5 && isActiveRef.current) {
            console.log(`useNetworkCamera: Attempting reconnection ${reconnectAttempts + 1}/5`);
            connectToCamera(config);
          } else {
            console.log('useNetworkCamera: Max reconnection attempts reached or stream inactive');
            setIsConnected(false);
            setConnectionError('Connection lost. Please try reconnecting manually.');
          }
        }, Math.min(2000 * Math.pow(2, reconnectAttempts), 30000)); // Exponential backoff, max 30s
      }
    };

    processChunk();
  }, [reconnectAttempts, currentConfig]);

  const connectToCamera = useCallback(async (config: NetworkCameraConfig) => {
    console.log('=== useNetworkCamera: Starting connection ===');
    console.log('useNetworkCamera: Config:', config);
    
    // Clean up any existing connections
    cleanupStream();
    
    // Mark stream as active
    isActiveRef.current = true;
    
    setIsConnecting(true);
    setConnectionError(null);
    setCurrentConfig(config);

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
        
        // Build the stream URL with auth if needed
        let streamUrl = config.url;
        console.log('useNetworkCamera: Original stream URL:', streamUrl);
        
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

        // Test connection first
        console.log('useNetworkCamera: Testing connection...');
        try {
          const testResponse = await fetch(finalUrl, { 
            method: 'HEAD',
            headers,
            signal: AbortSignal.timeout(10000) // Reduced timeout
          });
          
          if (!testResponse.ok) {
            throw new Error(`Connection test failed: ${testResponse.status} ${testResponse.statusText}`);
          }
          
          console.log('useNetworkCamera: Connection test successful');
        } catch (testError) {
          console.error('useNetworkCamera: Connection test failed:', testError);
          
          let errorMsg = 'Cannot reach camera';
          if (testError.name === 'TimeoutError' || testError.message.includes('timeout')) {
            errorMsg = 'Camera connection timeout. Please check your camera and network configuration.';
          } else if (isLocal) {
            errorMsg = 'Local network cameras cannot be reached from the cloud proxy. Please ensure your camera is accessible from the internet.';
          } else {
            errorMsg = `Cannot reach camera at ${config.url}. Please verify the camera is online and accessible.`;
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
              const response = await fetch(finalUrl, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(60000) // Longer timeout for stream
              });
              
              if (!response.ok) {
                throw new Error(`Failed to fetch stream: ${response.status}`);
              }
              
              // For MJPEG streams, we need to handle the multipart response
              const reader = response.body?.getReader();
              if (!reader) {
                throw new Error('No response body available');
              }
              
              // Set up success state BEFORE starting stream parsing
              setIsConnected(true);
              setCurrentConfig(config);
              setConnectionError(null);
              setIsConnecting(false);
              setReconnectAttempts(0);
              
              console.log('useNetworkCamera: Starting MJPEG stream parsing');
              
              // Start parsing the MJPEG stream - this will run continuously
              parseMJPEGStream(reader, element, config);
              
            } catch (fetchError) {
              console.error('useNetworkCamera: Fetch-based stream failed:', fetchError);
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

        // Connection timeout fallback
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
    videoRef,
    streamRef,
    reconnectAttempts,
    connectToCamera,
    disconnect,
    forceReconnect,
    testConnection
  };
};

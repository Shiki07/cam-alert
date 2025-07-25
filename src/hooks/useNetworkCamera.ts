
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
  }, []);

  const connectToMJPEGStream = useCallback(async (imgElement: HTMLImageElement, config: NetworkCameraConfig) => {
    try {
      console.log('useNetworkCamera: Starting native MJPEG stream connection');
      
      const { url: proxiedUrl, headers } = await getProxiedUrl(config.url);
      
      // Set up error handling
      const handleError = () => {
        console.log('useNetworkCamera: Native MJPEG stream error, attempting reconnection');
        if (isActiveRef.current && reconnectAttempts < 3) {
          setReconnectAttempts(prev => prev + 1);
          setTimeout(() => {
            if (isActiveRef.current) {
              connectToCamera(config);
            }
          }, 2000 * (reconnectAttempts + 1));
        } else {
          setIsConnected(false);
          setConnectionError('Camera stream unavailable');
          isActiveRef.current = false;
        }
      };
      
      const handleLoad = () => {
        console.log('useNetworkCamera: Native MJPEG stream connected successfully');
        setIsConnected(true);
        setCurrentConfig(config);
        setConnectionError(null);
        setIsConnecting(false);
        setReconnectAttempts(0);
        
        // Set up periodic connection monitoring
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
        }
        
        heartbeatRef.current = setInterval(() => {
          if (!isActiveRef.current) return;
          
          // Check if image is still loading new frames
          const currentTime = Date.now();
          if (currentTime - lastFrameTimeRef.current > 30000) {
            console.log('useNetworkCamera: Stream appears stalled, reconnecting');
            handleError();
          }
        }, 15000);
      };
      
      imgElement.onload = handleLoad;
      imgElement.onerror = handleError;
      
      // Direct approach - let the browser handle MJPEG natively
      // The proxy already handles authentication via Authorization header
      console.log('useNetworkCamera: Setting img src directly to proxy URL:', proxiedUrl);
      imgElement.src = proxiedUrl;
      
      lastFrameTimeRef.current = Date.now();
      
    } catch (error: any) {
      console.error('useNetworkCamera: Native MJPEG connection failed:', error);
      
      if (error.name === 'AbortError') {
        console.log('useNetworkCamera: Connection aborted (expected during cleanup)');
        return;
      }
      
      setConnectionError(`Connection failed: ${error.message}`);
      setIsConnecting(false);
      
      if (reconnectAttempts < 3) {
        console.log(`useNetworkCamera: Retrying connection (${reconnectAttempts + 1}/3)`);
        setReconnectAttempts(prev => prev + 1);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isActiveRef.current) {
            connectToCamera(config);
          }
        }, 3000 * (reconnectAttempts + 1));
      } else {
        setIsConnected(false);
        isActiveRef.current = false;
      }
    }
  }, [getProxiedUrl, reconnectAttempts]);

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
            // For proxied requests, we still need fetch but use simpler approach
            console.log('useNetworkCamera: Using native MJPEG with proxy');
            connectToMJPEGStream(element, config);
          } else {
            // Direct connection - let browser handle the stream natively
            console.log('useNetworkCamera: Using direct native MJPEG connection');
            connectToMJPEGStream(element, config);
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
  }, [isConnecting, isConnected, cleanupStream, connectToMJPEGStream]);

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

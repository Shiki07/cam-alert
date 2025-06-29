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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const getProxiedUrl = (originalUrl: string) => {
    console.log('=== getProxiedUrl - START ===');
    console.log('getProxiedUrl - originalUrl:', originalUrl);
    console.log('getProxiedUrl - window.location.protocol:', window.location.protocol);
    console.log('getProxiedUrl - originalUrl.startsWith("http://"):', originalUrl.startsWith('http://'));
    
    // Always use proxy for HTTP URLs when on HTTPS
    const shouldUseProxy = originalUrl.startsWith('http://') && window.location.protocol === 'https:';
    console.log('getProxiedUrl - shouldUseProxy:', shouldUseProxy);
    
    if (shouldUseProxy) {
      // For MJPEG streams, we need to use the proxy URL directly
      const proxyUrl = `https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/camera-proxy?url=${encodeURIComponent(originalUrl)}`;
      console.log('getProxiedUrl - USING PROXY - proxyUrl:', proxyUrl);
      console.log('=== getProxiedUrl - END (PROXY) ===');
      return proxyUrl;
    }
    
    console.log('getProxiedUrl - NOT USING PROXY - returning original URL:', originalUrl);
    console.log('=== getProxiedUrl - END (NO PROXY) ===');
    return originalUrl;
  };

  const connectToCamera = useCallback(async (config: NetworkCameraConfig) => {
    console.log('=== useNetworkCamera: Starting connection ===');
    console.log('useNetworkCamera: Config:', config);
    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (!videoRef.current) {
        throw new Error('Video element not available');
      }

      const video = videoRef.current;
      
      if (config.type === 'mjpeg') {
        console.log('useNetworkCamera: Setting up MJPEG stream');
        
        // Clear any existing source first
        console.log('useNetworkCamera: Clearing existing video sources');
        video.src = '';
        video.srcObject = null;
        video.load(); // Force clear
        
        // Build the stream URL with auth if needed
        let streamUrl = config.url;
        console.log('useNetworkCamera: Original stream URL:', streamUrl);
        
        if (config.username && config.password) {
          streamUrl = config.url.replace('://', `://${config.username}:${config.password}@`);
          console.log('useNetworkCamera: Stream URL with auth:', streamUrl);
        }

        // Get the proxied URL
        console.log('useNetworkCamera: Calling getProxiedUrl with streamUrl:', streamUrl);
        const finalUrl = getProxiedUrl(streamUrl);
        console.log('useNetworkCamera: Final stream URL from getProxiedUrl:', finalUrl);

        // Set up event handlers with better error reporting
        const handleSuccess = () => {
          console.log('useNetworkCamera: MJPEG stream connected successfully!');
          console.log('useNetworkCamera: Video src at success:', video.src);
          setIsConnected(true);
          setCurrentConfig(config);
          setConnectionError(null);
          setIsConnecting(false);
        };

        const handleError = (e: Event) => {
          console.error('useNetworkCamera: MJPEG stream error occurred!');
          console.error('useNetworkCamera: Error event:', e);
          console.error('useNetworkCamera: Video element src at error time:', video.src);
          console.error('useNetworkCamera: Video element current properties:');
          console.error('  - readyState:', video.readyState);
          console.error('  - networkState:', video.networkState);
          console.error('  - error:', video.error);
          
          let errorMsg = 'Failed to connect to camera stream';
          if (video.error) {
            switch (video.error.code) {
              case 1: // MEDIA_ERR_ABORTED
                errorMsg = 'Camera stream was aborted';
                break;
              case 2: // MEDIA_ERR_NETWORK
                errorMsg = 'Network error while loading camera stream';
                break;
              case 3: // MEDIA_ERR_DECODE
                errorMsg = 'Camera stream format not supported';
                break;
              case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                errorMsg = 'Camera stream source not supported or not accessible';
                break;
              default:
                errorMsg = `Camera stream error (code: ${video.error.code})`;
            }
            console.error('useNetworkCamera: Detailed error:', errorMsg);
          }
          
          setConnectionError(errorMsg);
          setIsConnected(false);
          setIsConnecting(false);
        };

        const handleLoadStart = () => {
          console.log('useNetworkCamera: Video load started');
          console.log('useNetworkCamera: Video src during load start:', video.src);
        };

        const handleAbort = () => {
          console.log('useNetworkCamera: Video load aborted');
        };

        const handleStalled = () => {
          console.log('useNetworkCamera: Video stalled');
        };

        const handleProgress = () => {
          console.log('useNetworkCamera: Video loading progress');
        };

        // Remove existing listeners to avoid duplicates
        video.removeEventListener('loadedmetadata', handleSuccess);
        video.removeEventListener('canplay', handleSuccess);
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadstart', handleLoadStart);
        video.removeEventListener('abort', handleAbort);
        video.removeEventListener('stalled', handleStalled);
        video.removeEventListener('progress', handleProgress);

        // Add new listeners
        video.addEventListener('loadedmetadata', handleSuccess, { once: true });
        video.addEventListener('canplay', handleSuccess, { once: true });
        video.addEventListener('error', handleError);
        video.addEventListener('loadstart', handleLoadStart);
        video.addEventListener('abort', handleAbort);
        video.addEventListener('stalled', handleStalled);
        video.addEventListener('progress', handleProgress);

        // Configure video element for MJPEG streaming
        video.crossOrigin = 'anonymous';
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;

        // Set the proxied source
        console.log('useNetworkCamera: About to set video.src to:', finalUrl);
        video.src = finalUrl;
        console.log('useNetworkCamera: video.src has been set to:', video.src);
        
        // Verify the src was set correctly
        if (video.src !== finalUrl) {
          console.error('useNetworkCamera: ERROR - video.src was not set correctly!');
          console.error('useNetworkCamera: Expected:', finalUrl);
          console.error('useNetworkCamera: Actual:', video.src);
        }
        
        // Force load the video
        console.log('useNetworkCamera: Calling video.load()');
        video.load();
        console.log('useNetworkCamera: video.load() called');

      } else {
        throw new Error(`Stream type ${config.type} not fully supported yet`);
      }

    } catch (error) {
      console.error('useNetworkCamera: Connection error:', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    console.log('useNetworkCamera: Disconnecting');
    if (videoRef.current) {
      // Revoke blob URL if it exists
      if (videoRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoRef.current.src);
      }
      videoRef.current.src = '';
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsConnected(false);
    setCurrentConfig(null);
    setConnectionError(null);
  }, []);

  const testConnection = useCallback(async (config: NetworkCameraConfig): Promise<boolean> => {
    try {
      console.log('useNetworkCamera: Testing connection to:', config.url);
      
      // Build test URL with auth if needed
      let testUrl = config.url;
      if (config.username && config.password) {
        testUrl = config.url.replace('://', `://${config.username}:${config.password}@`);
      }
      
      // Use the edge function to test the connection
      const shouldUseProxy = testUrl.startsWith('http://') && window.location.protocol === 'https:';
      
      if (shouldUseProxy) {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        
        const { error } = await supabase.functions.invoke('camera-proxy', {
          body: { url: testUrl, method: 'HEAD' },
          headers
        });
        
        console.log('useNetworkCamera: Connection test result:', !error);
        return !error;
      } else {
        // Direct connection test
        const response = await fetch(testUrl, { 
          method: 'HEAD',
          mode: 'cors'
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
    connectToCamera,
    disconnect,
    testConnection
  };
};

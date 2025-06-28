
import { useState, useRef, useCallback } from 'react';

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
      const proxyUrl = `https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/camera-proxy`;
      const finalUrl = `${proxyUrl}?url=${encodeURIComponent(originalUrl)}`;
      console.log('getProxiedUrl - USING PROXY - proxyUrl:', proxyUrl);
      console.log('getProxiedUrl - USING PROXY - encoded originalUrl:', encodeURIComponent(originalUrl));
      console.log('getProxiedUrl - USING PROXY - finalUrl:', finalUrl);
      console.log('=== getProxiedUrl - END (PROXY) ===');
      return finalUrl;
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
        console.log('useNetworkCamera: Calling getProxiedUrl...');
        const finalUrl = getProxiedUrl(streamUrl);
        console.log('useNetworkCamera: Final stream URL received from getProxiedUrl:', finalUrl);

        // Verify the URL is actually proxied if it should be
        if (streamUrl.startsWith('http://') && window.location.protocol === 'https:') {
          if (!finalUrl.includes('camera-proxy')) {
            console.error('useNetworkCamera: ERROR - Proxy should be used but finalUrl does not contain camera-proxy!');
            console.error('useNetworkCamera: streamUrl:', streamUrl);
            console.error('useNetworkCamera: finalUrl:', finalUrl);
          } else {
            console.log('useNetworkCamera: SUCCESS - Proxy URL correctly applied');
          }
        }

        // Set up event handlers
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
          
          const errorMsg = 'Failed to connect to MJPEG stream. Please check that your camera is accessible and the URL is correct.';
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

        // Remove existing listeners to avoid duplicates
        video.removeEventListener('loadedmetadata', handleSuccess);
        video.removeEventListener('canplay', handleSuccess);
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadstart', handleLoadStart);
        video.removeEventListener('abort', handleAbort);
        video.removeEventListener('stalled', handleStalled);

        // Add new listeners
        video.addEventListener('loadedmetadata', handleSuccess, { once: true });
        video.addEventListener('canplay', handleSuccess, { once: true });
        video.addEventListener('error', handleError);
        video.addEventListener('loadstart', handleLoadStart);
        video.addEventListener('abort', handleAbort);
        video.addEventListener('stalled', handleStalled);

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
      
      // Use proxy for the test as well
      const finalTestUrl = getProxiedUrl(testUrl);
      console.log('useNetworkCamera: Testing with URL:', finalTestUrl);
      
      const response = await fetch(finalTestUrl, { 
        method: 'HEAD',
        mode: 'cors'
      });
      console.log('useNetworkCamera: Connection test response:', response.status);
      return response.ok;
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

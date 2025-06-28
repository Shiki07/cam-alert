
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
    console.log('getProxiedUrl - START');
    console.log('getProxiedUrl - originalUrl:', originalUrl);
    console.log('getProxiedUrl - window.location.protocol:', window.location.protocol);
    console.log('getProxiedUrl - originalUrl.startsWith("http://"):', originalUrl.startsWith('http://'));
    
    // Always use proxy for HTTP URLs when on HTTPS
    if (originalUrl.startsWith('http://') && window.location.protocol === 'https:') {
      const proxyUrl = `https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/camera-proxy`;
      const finalUrl = `${proxyUrl}?url=${encodeURIComponent(originalUrl)}`;
      console.log('getProxiedUrl - USING PROXY - finalUrl:', finalUrl);
      return finalUrl;
    }
    console.log('getProxiedUrl - NOT USING PROXY - returning original URL:', originalUrl);
    return originalUrl;
  };

  const connectToCamera = useCallback(async (config: NetworkCameraConfig) => {
    console.log('useNetworkCamera: Starting connection to:', config);
    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (!videoRef.current) {
        throw new Error('Video element not available');
      }

      const video = videoRef.current;
      
      if (config.type === 'mjpeg') {
        console.log('useNetworkCamera: Setting up MJPEG stream');
        
        // Clear any existing source
        video.src = '';
        video.srcObject = null;
        
        // Build the stream URL with auth if needed
        let streamUrl = config.url;
        console.log('useNetworkCamera: Original stream URL:', streamUrl);
        
        if (config.username && config.password) {
          streamUrl = config.url.replace('://', `://${config.username}:${config.password}@`);
          console.log('useNetworkCamera: Stream URL with auth:', streamUrl);
        }

        // ALWAYS use proxy for HTTP URLs
        const finalUrl = getProxiedUrl(streamUrl);
        console.log('useNetworkCamera: Final stream URL being set:', finalUrl);
        console.log('useNetworkCamera: About to set video.src to:', finalUrl);

        // Set up event handlers
        const handleSuccess = () => {
          console.log('useNetworkCamera: MJPEG stream connected successfully');
          setIsConnected(true);
          setCurrentConfig(config);
          setConnectionError(null);
          setIsConnecting(false);
        };

        const handleError = (e: Event) => {
          console.error('useNetworkCamera: MJPEG stream error:', e);
          console.error('useNetworkCamera: Video element src at error time:', video.src);
          setConnectionError('Failed to connect to MJPEG stream. The camera might be unreachable or the stream format is not supported.');
          setIsConnected(false);
          setIsConnecting(false);
        };

        const handleLoadStart = () => {
          console.log('useNetworkCamera: Video load started, src:', video.src);
        };

        // Remove existing listeners to avoid duplicates
        video.removeEventListener('loadedmetadata', handleSuccess);
        video.removeEventListener('canplay', handleSuccess);
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadstart', handleLoadStart);

        // Add new listeners
        video.addEventListener('loadedmetadata', handleSuccess, { once: true });
        video.addEventListener('canplay', handleSuccess, { once: true });
        video.addEventListener('error', handleError);
        video.addEventListener('loadstart', handleLoadStart);

        // Configure video element for MJPEG streaming
        video.crossOrigin = 'anonymous';
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;

        // Set the proxied source directly
        console.log('useNetworkCamera: SETTING video.src to:', finalUrl);
        video.src = finalUrl;
        console.log('useNetworkCamera: AFTER SETTING - video.src is now:', video.src);
        
        // Force load the video
        video.load();
        console.log('useNetworkCamera: Called video.load()');

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
      const testUrl = getProxiedUrl(config.url);
      console.log('useNetworkCamera: Testing with URL:', testUrl);
      const response = await fetch(testUrl, { 
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

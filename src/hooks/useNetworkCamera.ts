
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

  const connectToCamera = useCallback(async (config: NetworkCameraConfig) => {
    console.log('useNetworkCamera: Starting connection to:', config);
    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (videoRef.current) {
        console.log('useNetworkCamera: Video element found, proceeding with connection');
        
        // For MJPEG streams, we can use the URL directly
        if (config.type === 'mjpeg') {
          console.log('useNetworkCamera: Setting up MJPEG stream');
          
          const authUrl = config.username && config.password 
            ? config.url.replace('://', `://${config.username}:${config.password}@`)
            : config.url;
          
          // Add timestamp to prevent caching
          const streamUrl = authUrl + (authUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
          console.log('useNetworkCamera: Final stream URL:', streamUrl);
          
          // Clear any existing src
          videoRef.current.src = '';
          videoRef.current.srcObject = null;
          
          // Set up event handlers before setting src
          const video = videoRef.current;
          
          const handleLoadStart = () => {
            console.log('useNetworkCamera: MJPEG stream loadstart event');
          };
          
          const handleLoadedMetadata = () => {
            console.log('useNetworkCamera: MJPEG stream metadata loaded');
            setIsConnected(true);
            setCurrentConfig(config);
            console.log('useNetworkCamera: Connection successful, state updated');
          };
          
          const handleCanPlay = () => {
            console.log('useNetworkCamera: MJPEG stream can play');
            setIsConnected(true);
            setCurrentConfig(config);
          };
          
          const handleError = (e: Event) => {
            console.error('useNetworkCamera: MJPEG stream error:', e);
            const errorMsg = 'Failed to connect to MJPEG stream. Check if the stream URL is accessible and supports CORS.';
            setConnectionError(errorMsg);
            setIsConnected(false);
          };
          
          const handleLoad = () => {
            console.log('useNetworkCamera: MJPEG stream loaded');
            setIsConnected(true);
            setCurrentConfig(config);
          };
          
          // Add event listeners
          video.addEventListener('loadstart', handleLoadStart);
          video.addEventListener('loadedmetadata', handleLoadedMetadata);
          video.addEventListener('canplay', handleCanPlay);
          video.addEventListener('error', handleError);
          video.addEventListener('load', handleLoad);
          
          // Set properties
          video.crossOrigin = 'anonymous';
          video.autoplay = true;
          video.playsInline = true;
          
          // Set the source
          console.log('useNetworkCamera: Setting video src to:', streamUrl);
          video.src = streamUrl;
          
          // Force load
          video.load();
          
          // Set a timeout to check connection status
          setTimeout(() => {
            if (!isConnected) {
              console.log('useNetworkCamera: Connection timeout, checking video state');
              console.log('useNetworkCamera: Video readyState:', video.readyState);
              console.log('useNetworkCamera: Video networkState:', video.networkState);
              console.log('useNetworkCamera: Video error:', video.error);
              
              if (video.readyState >= 1) {
                console.log('useNetworkCamera: Video has metadata, setting connected');
                setIsConnected(true);
                setCurrentConfig(config);
              }
            }
          }, 3000);
          
        } else if (config.type === 'rtsp') {
          throw new Error('RTSP support requires additional setup. Please use MJPEG for now.');
        } else if (config.type === 'hls') {
          if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            videoRef.current.src = config.url;
            videoRef.current.crossOrigin = 'anonymous';
            videoRef.current.onloadstart = () => {
              setIsConnected(true);
              setCurrentConfig(config);
            };
          } else {
            throw new Error('HLS not supported in this browser');
          }
        }
      } else {
        console.error('useNetworkCamera: Video element not found');
        throw new Error('Video element not available');
      }
    } catch (error) {
      console.error('useNetworkCamera: Connection error:', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
      console.log('useNetworkCamera: Connection attempt finished');
    }
  }, [isConnected]);

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
      const response = await fetch(config.url, { 
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

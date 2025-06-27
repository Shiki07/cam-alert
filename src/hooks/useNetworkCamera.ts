
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
        if (config.username && config.password) {
          streamUrl = config.url.replace('://', `://${config.username}:${config.password}@`);
        }

        console.log('useNetworkCamera: Final stream URL:', streamUrl);

        // Set up event handlers
        const handleSuccess = () => {
          console.log('useNetworkCamera: MJPEG stream connected successfully');
          setIsConnected(true);
          setCurrentConfig(config);
          setConnectionError(null);
        };

        const handleError = (e: Event) => {
          console.error('useNetworkCamera: MJPEG stream error:', e);
          setConnectionError('Failed to connect to MJPEG stream');
          setIsConnected(false);
        };

        // Remove existing listeners
        video.removeEventListener('loadedmetadata', handleSuccess);
        video.removeEventListener('canplay', handleSuccess);
        video.removeEventListener('error', handleError);

        // Add new listeners
        video.addEventListener('loadedmetadata', handleSuccess);
        video.addEventListener('canplay', handleSuccess);
        video.addEventListener('error', handleError);

        // Configure video element
        video.crossOrigin = 'anonymous';
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;

        // Set the source
        video.src = streamUrl;
        video.load();

      } else {
        throw new Error(`Stream type ${config.type} not fully supported yet`);
      }

    } catch (error) {
      console.error('useNetworkCamera: Connection error:', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnected(false);
    } finally {
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

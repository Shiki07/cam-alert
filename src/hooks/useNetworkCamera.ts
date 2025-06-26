
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
    setIsConnecting(true);
    setConnectionError(null);

    try {
      if (videoRef.current) {
        // For MJPEG streams, we can use the URL directly
        if (config.type === 'mjpeg') {
          const authUrl = config.username && config.password 
            ? config.url.replace('://', `://${config.username}:${config.password}@`)
            : config.url;
          
          videoRef.current.src = authUrl;
          videoRef.current.onloadstart = () => {
            setIsConnected(true);
            setCurrentConfig(config);
          };
          videoRef.current.onerror = () => {
            throw new Error('Failed to connect to MJPEG stream');
          };
        } 
        // For RTSP, we'd need a different approach (WebRTC or conversion)
        else if (config.type === 'rtsp') {
          // This is a simplified implementation - real RTSP would need a media server
          throw new Error('RTSP support requires additional setup. Please use MJPEG for now.');
        }
        // For HLS streams
        else if (config.type === 'hls') {
          if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            videoRef.current.src = config.url;
            videoRef.current.onloadstart = () => {
              setIsConnected(true);
              setCurrentConfig(config);
            };
          } else {
            throw new Error('HLS not supported in this browser');
          }
        }
      }
    } catch (error) {
      console.error('Network camera connection error:', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
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
      const response = await fetch(config.url, { 
        method: 'HEAD',
        mode: 'no-cors'
      });
      return true;
    } catch {
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

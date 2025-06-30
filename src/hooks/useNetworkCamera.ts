

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

  const isLocalNetwork = (url: string) => {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Check for local network IP ranges
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
          console.log('useNetworkCamera: Stream URL with auth (hidden for security)');
        }

        // Get the proxied URL
        console.log('useNetworkCamera: Calling getProxiedUrl with streamUrl:', streamUrl);
        const finalUrl = getProxiedUrl(streamUrl);
        console.log('useNetworkCamera: Final stream URL from getProxiedUrl:', finalUrl);

        // Check if this is a local network camera
        const isLocal = isLocalNetwork(config.url);
        console.log('useNetworkCamera: Is local network camera:', isLocal);

        // Only test connection for non-local cameras or if not using proxy
        if (!isLocal && finalUrl !== streamUrl) {
          console.log('useNetworkCamera: Testing connection...');
          try {
            const testResponse = await fetch(finalUrl, { 
              method: 'HEAD',
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            if (!testResponse.ok) {
              throw new Error(`Connection test failed: ${testResponse.status} ${testResponse.statusText}`);
            }
            
            console.log('useNetworkCamera: Connection test successful');
          } catch (testError) {
            console.error('useNetworkCamera: Connection test failed:', testError);
            
            if (isLocal) {
              console.warn('useNetworkCamera: Local network camera detected - this is expected to fail from cloud proxy');
              setConnectionError('Local network cameras cannot be reached from the cloud proxy. Please ensure your camera is accessible from the internet or use HTTPS.');
              setIsConnecting(false);
              return;
            }
            
            throw new Error(`Cannot reach camera: ${testError.message}`);
          }
        } else if (isLocal) {
          console.log('useNetworkCamera: Skipping connection test for local network camera');
          setConnectionError('Warning: Local network camera detected. Connection may fail due to network restrictions.');
        }

        // Set up event handlers
        const handleSuccess = () => {
          console.log('useNetworkCamera: MJPEG stream connected successfully!');
          console.log('useNetworkCamera: Video element properties at success:');
          console.log('  - readyState:', video.readyState);
          console.log('  - networkState:', video.networkState);
          console.log('  - videoWidth:', video.videoWidth);
          console.log('  - videoHeight:', video.videoHeight);
          console.log('  - duration:', video.duration);
          
          setIsConnected(true);
          setCurrentConfig(config);
          setConnectionError(null);
          setIsConnecting(false);
        };

        const handleError = (e: Event) => {
          console.error('useNetworkCamera: MJPEG stream error occurred!');
          console.error('useNetworkCamera: Error event:', e);
          console.error('useNetworkCamera: Video element current properties:');
          console.error('  - readyState:', video.readyState);
          console.error('  - networkState:', video.networkState);
          console.error('  - error:', video.error);
          
          let errorMsg = 'Failed to connect to camera stream';
          if (video.error) {
            console.error('useNetworkCamera: MediaError details:', {
              code: video.error.code,
              message: video.error.message
            });
            
            switch (video.error.code) {
              case 1: // MEDIA_ERR_ABORTED
                errorMsg = 'Camera stream was aborted';
                break;
              case 2: // MEDIA_ERR_NETWORK
                if (isLocal) {
                  errorMsg = 'Cannot reach local network camera from cloud proxy. Your camera needs to be accessible from the internet or use HTTPS.';
                } else {
                  errorMsg = 'Network error while loading camera stream - please check if your camera is accessible';
                }
                break;
              case 3: // MEDIA_ERR_DECODE
                errorMsg = 'Camera stream format not supported or corrupted';
                break;
              case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                if (isLocal) {
                  errorMsg = 'Local network camera cannot be accessed from this HTTPS site. Please use an HTTPS camera URL or access this site over HTTP.';
                } else {
                  errorMsg = 'Camera stream source not supported - MJPEG format may be incompatible with this browser';
                }
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

        const handleCanPlay = () => {
          console.log('useNetworkCamera: Video can play');
          console.log('useNetworkCamera: Video dimensions:', video.videoWidth, 'x', video.videoHeight);
        };

        // Remove existing listeners to avoid duplicates
        video.removeEventListener('loadedmetadata', handleSuccess);
        video.removeEventListener('canplay', handleSuccess);
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadstart', handleLoadStart);
        video.removeEventListener('canplay', handleCanPlay);

        // Add new listeners
        video.addEventListener('loadedmetadata', handleSuccess, { once: true });
        video.addEventListener('error', handleError);
        video.addEventListener('loadstart', handleLoadStart);
        video.addEventListener('canplay', handleCanPlay);

        // Configure video element for MJPEG streaming
        video.crossOrigin = 'anonymous';
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.controls = false;

        // Set the source and load
        console.log('useNetworkCamera: About to set video.src to:', finalUrl);
        video.src = finalUrl;
        console.log('useNetworkCamera: video.src has been set to:', video.src);
        
        console.log('useNetworkCamera: Calling video.load()');
        video.load();
        console.log('useNetworkCamera: video.load() called');

        // Add a timeout to catch hanging connections
        setTimeout(() => {
          if (isConnecting && !isConnected) {
            console.warn('useNetworkCamera: Connection timeout after 15 seconds');
            const timeoutMsg = isLocal 
              ? 'Connection timeout - Local network cameras cannot be accessed from this HTTPS site. Please ensure your camera is accessible from the internet or use an HTTPS camera URL.'
              : 'Connection timeout - camera may not be responding or MJPEG format is not supported';
            setConnectionError(timeoutMsg);
            setIsConnecting(false);
          }
        }, 15000);

      } else {
        throw new Error(`Stream type ${config.type} not fully supported yet`);
      }

    } catch (error) {
      console.error('useNetworkCamera: Connection error:', error);
      setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      setIsConnected(false);
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected]);

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
      
      // Check if this is a local network camera
      const isLocal = isLocalNetwork(config.url);
      console.log('useNetworkCamera: Is local network camera for test:', isLocal);
      
      if (isLocal) {
        console.log('useNetworkCamera: Skipping connection test for local network camera');
        return false; // Return false to indicate test cannot be performed
      }
      
      // Build test URL with auth if needed
      let testUrl = config.url;
      if (config.username && config.password) {
        testUrl = config.url.replace('://', `://${config.username}:${config.password}@`);
      }
      
      // Use the proxy endpoint for testing
      const shouldUseProxy = testUrl.startsWith('http://') && window.location.protocol === 'https:';
      
      if (shouldUseProxy) {
        // Test using the proxy endpoint with HEAD method
        const response = await fetch(`https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/camera-proxy?url=${encodeURIComponent(testUrl)}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });
        
        console.log('useNetworkCamera: Connection test result:', response.ok, response.status);
        return response.ok;
      } else {
        // Direct connection test
        const response = await fetch(testUrl, { 
          method: 'HEAD',
          mode: 'cors',
          signal: AbortSignal.timeout(5000)
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


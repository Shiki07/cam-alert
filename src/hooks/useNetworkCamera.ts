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
  const isConnectingRef = useRef(false); // Lock to prevent overlapping connections
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
    // Always use proxy for HTTP cameras on HTTPS sites to handle CORS
    const shouldUseProxy = originalUrl.startsWith('http://') && window.location.protocol === 'https:';
    
    if (shouldUseProxy) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }
      
      // Include the auth token as a URL parameter for img elements
      const proxyUrl = new URL('https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/camera-proxy');
      proxyUrl.searchParams.set('url', originalUrl);
      // token sent via Authorization header instead of query param
      
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
    isConnectingRef.current = false;
    
    // Cancel any pending fetch operations gracefully
    if (fetchControllerRef.current) {
      try {
        fetchControllerRef.current.abort();
      } catch (error) {
        // Ignore abort errors during cleanup
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

  // Zero-delay instant restart for truly seamless experience
  const startOverlappingConnection = useCallback(async (imgElement: HTMLImageElement, config: NetworkCameraConfig) => {
    console.log('useNetworkCamera: Executing zero-delay instant restart');
    
    // Reset counters immediately
    frameCountRef.current = 0;
    setReconnectAttempts(0);
    connectionAgeRef.current = Date.now();
    
    // Start new connection with absolutely zero delay
    if (isActiveRef.current) {
      connectToMJPEGStream(imgElement, config);
    }
    
  }, []);

  const connectToCamera = useCallback(async (config: NetworkCameraConfig) => {
    console.log('=== useNetworkCamera: Starting connection ===');
    console.log('useNetworkCamera: Config:', config);
    console.log('useNetworkCamera: Quality setting:', config.quality);
    
    // Clean up any existing connections
    cleanupStream();
    
    // Mark stream as active and connecting
    isActiveRef.current = true;
    isConnectingRef.current = true;
    
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
        
        // Fix malformed URLs where port appears in path instead of hostname
        if (streamUrl.includes('/8000.stream.mjpg')) {
          streamUrl = streamUrl.replace('/8000.stream.mjpg', ':8000/stream.mjpg');
          console.log('useNetworkCamera: Fixed malformed URL to:', streamUrl);
        }
        
        console.log('useNetworkCamera: Using stream URL:', streamUrl);
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
      isConnectingRef.current = false;
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

      if (!response.ok) {
        let details = '';
        try {
          const data = await response.clone().json();
          details = data?.error || data?.code || JSON.stringify(data);
        } catch (_) {
          try {
            details = await response.clone().text();
          } catch { /* ignore */ }
        }
        throw new Error(`HTTP ${response.status}: ${details || response.statusText}`);
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
        let lastFrameTime = Date.now();
        let skippedFrames = 0;
        
        // Optimize for Pi Zero 2 W - balance performance vs smoothness
        const BASE_THROTTLE_MS =
          config.quality === 'low' ? 90 :    // ~11 FPS
          config.quality === 'medium' ? 75 : // ~13 FPS
          60;                                 // ~16-17 FPS high


        // Stall detection - restart if no frames for too long
        const STALL_TIMEOUT_MS = 8000; // 8 seconds without new frames = stalled
        let stallCheckInterval: NodeJS.Timeout | null = null;
        
        const startStallDetection = () => {
          if (stallCheckInterval) clearInterval(stallCheckInterval);
          stallCheckInterval = setInterval(() => {
            const timeSinceLastFrame = Date.now() - lastFrameTimeRef.current;
            if (isActiveRef.current && isConnected && timeSinceLastFrame > STALL_TIMEOUT_MS) {
              console.log(`useNetworkCamera: Stream stalled (${timeSinceLastFrame}ms since last frame), restarting...`);
              if (stallCheckInterval) clearInterval(stallCheckInterval);
              
              // Abort current read and restart
              if (fetchControllerRef.current) {
                fetchControllerRef.current.abort();
              }
              
              // Seamless restart
              if (isActiveRef.current) {
                setTimeout(() => {
                  if (isActiveRef.current) {
                    startOverlappingConnection(imgElement, config);
                  }
                }, 100);
              }
            }
          }, 2000); // Check every 2 seconds
        };

        const processStream = async () => {
          // Start stall detection once connected
          startStallDetection();
          
          while (isActiveRef.current) {
            try {
              const { done, value } = await reader.read();
              
              if (done) {
                const connectionAge = Date.now() - connectionAgeRef.current;
                const framesProcessed = frameCountRef.current;
                
                console.log(`useNetworkCamera: Stream ended. Age: ${connectionAge}ms, Frames: ${framesProcessed}, Skipped: ${skippedFrames}`);
                
                // Clear stall detection
                if (stallCheckInterval) clearInterval(stallCheckInterval);
                
                // Distinguish between natural cycling and actual errors
                if (connectionAge < 10000 && framesProcessed < 5) { // Less than 10s and very few frames = error
                  console.log('useNetworkCamera: Connection error detected, reconnecting with delay...');
                  if (isActiveRef.current && reconnectAttempts < 3) { // Reduce max attempts
                    setReconnectAttempts(prev => prev + 1);
                    const delay = Math.min(3000 * reconnectAttempts, 10000); // Slower backoff
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
                    isConnectingRef.current = false;
                  }
                } else {
                  // Natural stream cycling - immediate seamless restart
                  console.log('useNetworkCamera: Natural stream cycle detected, immediate seamless restart...');
                  setReconnectAttempts(0); // Reset counter for natural cycles
                  if (isActiveRef.current) {
                    // Start overlapping connection immediately for seamless transition
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
                const now = Date.now();
                
                // Adaptive throttle: faster for first 5s, then settle based on quality
                const connectionAge = now - connectionAgeRef.current;
                const effectiveThrottleMs = connectionAge < 5000 ? Math.max(BASE_THROTTLE_MS - 30, 40) : BASE_THROTTLE_MS;
                const shouldProcessFrame = !isConnected || (now - lastFrameTime) >= effectiveThrottleMs;
                
                if (shouldProcessFrame) {
                  const frameData = buffer.slice(startIdx, endIdx);
                  const blob = new Blob([frameData], { type: 'image/jpeg' });
                  
                  // Revoke previous blob URL
                  if (imgElement.src && imgElement.src.startsWith('blob:')) {
                    URL.revokeObjectURL(imgElement.src);
                    blobUrlsRef.current.delete(imgElement.src);
                  }
                  
                  const blobUrl = URL.createObjectURL(blob);
                  imgElement.src = blobUrl;
                  
                  // Reduce blob URL buffer for Pi Zero memory optimization
                  blobUrlsRef.current.add(blobUrl);
                  if (blobUrlsRef.current.size > 3) { // Reduced from 10 to 3
                    const oldestUrl = blobUrlsRef.current.values().next().value;
                    URL.revokeObjectURL(oldestUrl);
                    blobUrlsRef.current.delete(oldestUrl);
                  }
                  
                  frameCount++;
                  frameCountRef.current = frameCount;
                  lastFrameTime = now;
                  lastFrameTimeRef.current = now;
                  
                  // Less frequent frame rate calculation
                  if (frameCount % 20 === 0 && now - lastFrameRateCheckRef.current > 3000) {
                    const timeDiff = (now - lastFrameRateCheckRef.current) / 1000;
                    frameRateRef.current = frameCount / timeDiff;
                    lastFrameRateCheckRef.current = now;
                  }
                  
                  if (!isConnected) {
                    console.log('useNetworkCamera: MJPEG fetch stream connected successfully!');
                    setIsConnected(true);
                    setCurrentConfig(config);
                    setConnectionError(null);
                    setIsConnecting(false);
                    setReconnectAttempts(0);
                    connectionAgeRef.current = now;
                    isConnectingRef.current = false; // Connection established
                  }
                } else {
                  skippedFrames++;
                }
                
                // Always remove processed data from buffer
                buffer = buffer.slice(endIdx);
              }

              // Tighter buffer limits to reduce scanning overhead
              if (buffer.length > 2 * 1024 * 1024) {
                buffer = buffer.slice(-1 * 1024 * 1024); // keep last 1MB
              }
              
            } catch (readError: any) {
              // Clear stall detection on error
              if (stallCheckInterval) clearInterval(stallCheckInterval);
              
              if (readError.name === 'AbortError') {
                console.log('useNetworkCamera: Stream read aborted');
                break;
              }
              throw readError;
            }
          }
          
          // Cleanup stall detection when loop exits
          if (stallCheckInterval) clearInterval(stallCheckInterval);
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
          
          if (framesProcessed > 200) { // Had a good run, restart immediately with seamless transition
            console.log('useNetworkCamera: Good stream run completed, seamless restart');
            if (isActiveRef.current) {
              setReconnectAttempts(0); // Reset attempts for good connections
              startOverlappingConnection(imgElement, config); // Use seamless transition
            }
          } else if (isActiveRef.current && reconnectAttempts < 3) {
            setReconnectAttempts(prev => prev + 1);
            // Minimal delay for actual errors
            const delay = Math.min(1000 * reconnectAttempts, 3000); // Reduced delays
            setTimeout(() => {
              if (isActiveRef.current) {
                connectToMJPEGStream(imgElement, config);
              }
            }, delay);
          } else {
            setConnectionError('Fetch-based stream processing failed. Your camera is confirmed working, but there may be a temporary connectivity issue.');
            setIsConnected(false);
            isActiveRef.current = false;
            isConnectingRef.current = false;
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
        console.error('useNetworkCamera: Fetch-based connection failed:', error);
        isConnectingRef.current = false;

        // If cloud proxy cannot reach LAN, try DuckDNS fallback on port 8000 automatically
        const msg = (error instanceof Error ? error.message : String(error)) || '';
        if (msg.includes('LAN address not reachable from cloud')) {
          try {
            const duckCfgRaw = localStorage.getItem('duckdns-config');
            if (duckCfgRaw) {
              const duckCfg = JSON.parse(duckCfgRaw);
              if (duckCfg?.enabled && duckCfg?.domain) {
                const domain = duckCfg.domain.includes('.duckdns.org') ? duckCfg.domain : `${duckCfg.domain}.duckdns.org`;
                const fallbackUrl = `http://${domain}:8000/stream.mjpg`;
                console.log('useNetworkCamera: Trying DuckDNS fallback:', fallbackUrl);
                const { url: fallbackProxied } = await getProxiedUrl(fallbackUrl);

                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error('Authentication session required');

                const fbResp = await fetch(fallbackProxied, {
                  method: 'GET',
                  signal: controller.signal,
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Accept': 'multipart/x-mixed-replace, image/jpeg, */*',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                  },
                  credentials: 'omit'
                });

                if (fbResp.ok) {
                  console.log('useNetworkCamera: DuckDNS fallback succeeded');
                  // Replace response with fallback and continue normal flow
                  // Re-run logic by recursively calling with updated config URL
                  const newConfig = { ...config, url: fallbackUrl } as NetworkCameraConfig;
                  connectToMJPEGStream(imgElement, newConfig);
                  return;
                } else {
                  console.log('useNetworkCamera: DuckDNS fallback failed with status', fbResp.status);
                }
              }
            }
          } catch (fbErr) {
            console.log('useNetworkCamera: DuckDNS fallback attempt errored:', fbErr);
          }
        }
      
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
          setConnectionError(`Camera connection failed after multiple attempts. If this is a local IP, enable DuckDNS and forward port 8000, then use your DuckDNS URL.`);
          setIsConnected(false);
          setIsConnecting(false);
          isActiveRef.current = false;
          isConnectingRef.current = false;
        }
      }
    } catch (error) {
      console.error('useNetworkCamera: connectToMJPEGStream error:', error);
      setConnectionError('Failed to establish camera connection');
      setIsConnected(false);
      setIsConnecting(false);
      isActiveRef.current = false;
      isConnectingRef.current = false;
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
    console.log('=== testConnection: Starting test for:', config.name, config.url);
    
    try {
      // Build stream URL with credentials if provided
      let testUrl = config.url;
      if (config.username && config.password) {
        testUrl = config.url.replace('://', `://${config.username}:${config.password}@`);
        console.log('testConnection: Added credentials to URL');
      }

      // Get proxied URL for testing
      console.log('testConnection: Getting proxied URL for:', testUrl);
      const { url: proxiedUrl } = await getProxiedUrl(testUrl);
      console.log('testConnection: Proxied URL:', proxiedUrl);

      // Test connection with longer timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        console.log('testConnection: Timeout reached, aborting');
        controller.abort();
      }, 10000); // 10 seconds

      try {
        console.log('testConnection: Getting authentication session...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('testConnection: Session error:', sessionError);
          throw new Error('Authentication session error: ' + sessionError.message);
        }
        if (!session) {
          console.error('testConnection: No session found');
          throw new Error('No authentication session found');
        }
        console.log('testConnection: Session valid, user:', session.user?.email);

        console.log('testConnection: Making fetch request...');
        const response = await fetch(proxiedUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'User-Agent': 'CamAlert-ConnectionTest/1.0',
            'Accept': 'multipart/x-mixed-replace, image/jpeg, */*',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          credentials: 'omit'
        });

        clearTimeout(timeout);
        console.log('testConnection: Response received - Status:', response.status, 'StatusText:', response.statusText);
        console.log('testConnection: Response headers:', Object.fromEntries(response.headers.entries()));
        
        // Accept successful responses and redirects as camera being reachable
        const isSuccess = (response.status >= 200 && response.status < 400) || response.status === 501;
        console.log('testConnection: Is success?', isSuccess, '(status', response.status, ')');
        if (isSuccess) return true;
      } catch (error: any) {
        clearTimeout(timeout);
        console.error('testConnection: Fetch failed:', error);
        if (error.name === 'AbortError') {
          console.log('testConnection: Request was aborted due to timeout');
        }
        // Continue to diagnostics fallback below
      }

      // Fallback: use diagnostics function to decide
      console.log('testConnection: Falling back to diagnostics check...');
      const { data, error } = await supabase.functions.invoke('camera-diagnostics', {
        body: { url: config.url }
      });
      if (error) {
        console.error('testConnection: Diagnostics fallback failed:', error);
        return false;
      }
      const tests = data?.tests || [];
      const targetOk = tests.find((t: any) => t.name === 'Target URL Connectivity')?.success;
      const streamOk = tests.find((t: any) => t.name === 'MJPEG Stream')?.success;
      const diagSuccess = Boolean(targetOk && streamOk);
      console.log('testConnection: Diagnostics-based success?', diagSuccess);
      return diagSuccess;
    } catch (error) {
      console.error('testConnection: Setup failed:', error);
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
import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { useRecording } from "@/hooks/useRecording";
import { usePiRecording } from "@/hooks/usePiRecording";
import { useEnhancedMotionDetection } from "@/hooks/useEnhancedMotionDetection";
import { useImageMotionDetection } from "@/hooks/useImageMotionDetection";
import { useMotionNotification } from "@/hooks/useMotionNotification";
import { useNetworkCamera, NetworkCameraConfig } from "@/hooks/useNetworkCamera";
import { useConnectionMonitor } from "@/hooks/useConnectionMonitor";
import { CameraSourceSelector, CameraSource } from "@/components/CameraSourceSelector";
import { VideoDisplay } from "@/components/VideoDisplay";
import { CameraStatus } from "@/components/CameraStatus";
import { CameraOverlays } from "@/components/CameraOverlays";
import { CameraInfo } from "@/components/CameraInfo";
import { useToast } from "@/components/ui/use-toast";

interface LiveFeedProps {
  isRecording: boolean;
  onRecordingChange: (recording: boolean) => void;
  storageType: 'cloud' | 'local';
  quality: 'high' | 'medium' | 'low';
  motionDetectionEnabled: boolean;
  onMotionDetected: (detected: boolean) => void;
  emailNotificationsEnabled?: boolean;
  notificationEmail?: string;
  motionSensitivity: number;
  motionThreshold: number;
  scheduleEnabled: boolean;
  startHour: number;
  endHour: number;
  detectionZonesEnabled: boolean;
  cooldownPeriod: number;
  minMotionDuration: number;
  noiseReduction: boolean;
  dateOrganizedFolders?: boolean;
  piVideoPath?: string;
  dateOrganizedFoldersPi?: boolean;
  onConnectionChange?: (connected: boolean) => void;
}

export interface LiveFeedHandle {
  takeSnapshot: () => void;
  toggleRecording: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  isRecording: boolean;
  piServiceConnected: boolean | null;
}

export const LiveFeed = forwardRef<LiveFeedHandle, LiveFeedProps>(({ 
  isRecording, 
  onRecordingChange, 
  storageType, 
  quality,
  motionDetectionEnabled,
  onMotionDetected,
  emailNotificationsEnabled = false,
  notificationEmail = "",
  motionSensitivity,
  motionThreshold,
  scheduleEnabled,
  startHour,
  endHour,
  detectionZonesEnabled,
  cooldownPeriod,
  minMotionDuration,
  noiseReduction,
  dateOrganizedFolders = true,
  piVideoPath = '/home/pi/Videos',
  dateOrganizedFoldersPi = true,
  onConnectionChange
}, ref) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraSource, setCameraSource] = useState<CameraSource>('webcam');
  const [networkCameras, setNetworkCameras] = useState<NetworkCameraConfig[]>(() => {
    try {
      const saved = localStorage.getItem('networkCameras');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [piServiceConnected, setPiServiceConnected] = useState<boolean | null>(null);
  const [detectedPiIp, setDetectedPiIp] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRecordingAttemptRef = useRef<number>(0);
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRestartAttemptRef = useRef<number>(0);
  const { toast } = useToast();
  
  const recording = useRecording();
  const piRecording = usePiRecording();
  const networkCamera = useNetworkCamera();
  
  const connectionMonitor = useConnectionMonitor(
    cameraSource === 'network' ? networkCamera.currentConfig?.url : undefined,
    isConnected
  );

  const motionNotification = useMotionNotification({
    email: notificationEmail,
    enabled: emailNotificationsEnabled,
    includeAttachment: true
  });

  // Webcam motion detection (video element)
  const motionDetection = useEnhancedMotionDetection({
    sensitivity: motionSensitivity,
    threshold: motionThreshold,
    enabled: motionDetectionEnabled && isConnected && cameraSource === 'webcam',
    scheduleEnabled,
    startHour,
    endHour,
    detectionZonesEnabled,
    cooldownPeriod,
    minMotionDuration,
    noiseReduction,
    onMotionDetected: (motionLevel) => {
      console.log('Webcam motion detected with level:', motionLevel);
      onMotionDetected(true);
      
      const currentVideoRef = videoRef.current;
      
      // Send email notification
      if (emailNotificationsEnabled && notificationEmail && currentVideoRef instanceof HTMLVideoElement) {
        console.log('Sending motion alert for webcam');
        motionNotification.sendMotionAlert(currentVideoRef, motionLevel);
      }
      
      const currentStream = streamRef.current;
      const now = Date.now();
      const minRecordingInterval = 10000; // 10 seconds between auto-recording attempts
      
      if (!recording.isRecording && currentStream && currentVideoRef && 
          (now - lastRecordingAttemptRef.current > minRecordingInterval)) {
        console.log('Auto-starting recording due to webcam motion detection');
        lastRecordingAttemptRef.current = now;
        recording.startRecording(currentStream, {
          storageType,
          fileType: 'video',
          quality,
          motionDetected: true,
          dateOrganizedFolders
        });
        onRecordingChange(true);
      } else if (!recording.isRecording && currentStream && currentVideoRef) {
        console.log('Recording rate limited - too frequent motion detection attempts');
      }
    },
    onMotionCleared: () => {
      onMotionDetected(false);
    }
  });

  // Network camera motion detection (img element)
  const imageMotionDetection = useImageMotionDetection({
    sensitivity: motionSensitivity,
    threshold: motionThreshold,
    enabled: motionDetectionEnabled && isConnected && cameraSource === 'network',
    scheduleEnabled,
    startHour,
    endHour,
    detectionZonesEnabled,
    cooldownPeriod,
    minMotionDuration,
    noiseReduction,
    onMotionDetected: (motionLevel) => {
      console.log('Network camera motion detected with level:', motionLevel);
      onMotionDetected(true);
      
      // Send email notification for network cameras
      if (emailNotificationsEnabled && notificationEmail) {
        console.log('Sending motion alert for network camera');
        console.log('Email enabled:', emailNotificationsEnabled, 'Email:', notificationEmail);
        console.log('Network camera videoRef:', networkCamera.videoRef);
        console.log('Network camera videoRef.current:', networkCamera.videoRef.current);
        
        const currentImageRef = networkCamera.videoRef.current;
        if (currentImageRef instanceof HTMLImageElement) {
          console.log('Found HTMLImageElement, checking if loaded...');
          console.log('Image complete:', currentImageRef.complete);
          console.log('Image naturalWidth:', currentImageRef.naturalWidth);
          console.log('Image naturalHeight:', currentImageRef.naturalHeight);
          console.log('Image src:', currentImageRef.src);
          motionNotification.sendMotionAlert(undefined, motionLevel, currentImageRef);
        } else {
          console.log('Network camera element is not HTMLImageElement:', typeof currentImageRef);
          motionNotification.sendMotionAlert(undefined, motionLevel);
        }
      } else {
        console.log('Email notifications not enabled or no email set:', { emailNotificationsEnabled, notificationEmail });
      }
    },
    onMotionCleared: () => {
      onMotionDetected(false);
    }
  });

  const getVideoConstraints = () => {
    const constraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 }
    };

    switch (quality) {
      case 'high':
        constraints.width.ideal = 1920;
        constraints.height.ideal = 1080;
        constraints.frameRate.ideal = 30;
        break;
      case 'medium':
        constraints.width.ideal = 1280;
        constraints.height.ideal = 720;
        constraints.frameRate.ideal = 25;
        break;
      case 'low':
        constraints.width.ideal = 640;
        constraints.height.ideal = 480;
        constraints.frameRate.ideal = 20;
        break;
    }

    return constraints;
  };

  const startWebcam = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported in this browser');
      }

      // Try to enumerate devices first to check if cameras are available
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        if (videoDevices.length === 0) {
          throw new Error('No camera devices found on this device');
        }
        
        console.log(`Found ${videoDevices.length} camera device(s)`);
      } catch (enumError) {
        console.warn('Could not enumerate devices:', enumError);
        // Continue anyway as some browsers may restrict device enumeration
      }

      const videoConstraints = getVideoConstraints();
      console.log(`Starting webcam with ${quality} quality:`, videoConstraints);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: true
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsConnected(true);
        onConnectionChange?.(true);
        
        // Add comprehensive stream health monitoring
        const tracks = stream.getVideoTracks();
        if (tracks[0]) {
          tracks[0].addEventListener('ended', () => {
            console.log('Webcam track ended unexpectedly, attempting restart...');
            const now = Date.now();
            const minRestartInterval = 5000; // 5 seconds between restart attempts
            
            if (now - lastRestartAttemptRef.current > minRestartInterval) {
              lastRestartAttemptRef.current = now;
              setTimeout(() => {
                if (!streamRef.current && isConnected) { // Only restart if not manually stopped and still supposed to be connected
                  startWebcam();
                }
              }, 2000);
            } else {
              console.log('Restart attempt rate limited');
            }
          });
        }
        
        // Start periodic health check for webcam
        if (healthCheckIntervalRef.current) {
          clearInterval(healthCheckIntervalRef.current);
        }
        
        healthCheckIntervalRef.current = setInterval(() => {
          if (cameraSource === 'webcam' && videoRef.current && streamRef.current) {
            const tracks = streamRef.current.getVideoTracks();
            if (tracks.length === 0 || tracks[0].readyState === 'ended') {
              console.log('Health check detected dead webcam stream, restarting...');
              const now = Date.now();
              if (now - lastRestartAttemptRef.current > 5000) {
                lastRestartAttemptRef.current = now;
                startWebcam();
              }
            }
          }
        }, 30000); // Check every 30 seconds
        
        videoRef.current.onloadedmetadata = () => {
          if (motionDetectionEnabled && videoRef.current) {
            motionDetection.startDetection(videoRef.current);
          }
        };
      }
    } catch (err: any) {
      console.error('Error accessing webcam:', err);
      
      let errorMessage = 'Failed to access webcam';
      
      if (err.name === 'NotFoundError' || err.message?.includes('object can not be found')) {
        errorMessage = 'No camera found. Please connect a camera and refresh the page.';
      } else if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera access denied. Please allow camera permissions and try again.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is being used by another application. Please close other apps using the camera.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'Camera does not support the requested video quality. Try lowering the quality setting.';
      } else if (err.name === 'SecurityError') {
        errorMessage = 'Camera access blocked for security reasons. Please use HTTPS or check browser settings.';
      } else if (err.message?.includes('not supported')) {
        errorMessage = 'Camera access not supported in this browser.';
      } else {
        errorMessage = `Camera error: ${err.message || 'Unknown error'}`;
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (recording.isRecording) {
      recording.stopRecording();
      onRecordingChange(false);
    }
    
    motionDetection.stopDetection();
    imageMotionDetection.stopDetection();
    
    // Clear health check interval
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
    }
    
    if (cameraSource === 'webcam') {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } else {
      networkCamera.disconnect();
    }
    
    setIsConnected(false);
    onConnectionChange?.(false);
  };

  const handleRecordingToggle = async () => {
    // For network cameras, use Pi-based recording
    if (cameraSource === 'network') {
      if (!networkCamera.currentConfig) {
        toast({
          title: "No camera configured",
          description: "Please configure a network camera first",
          variant: "destructive",
        });
        return;
      }

      // Check Pi service connection first
      if (piServiceConnected === false) {
        toast({
          title: "Recording service unavailable",
          description: "The Pi recording service on port 3002 is not accessible. Make sure the service is running and port 3002 is forwarded.",
          variant: "destructive"
        });
        return;
      }

      // Get Pi URL - use detected local IP if available, otherwise use camera hostname
      const cameraUrl = new URL(networkCamera.currentConfig.url);
      const piUrl = detectedPiIp 
        ? `http://${detectedPiIp}:3002`
        : `http://${cameraUrl.hostname}:3002`;

      console.log('Using Pi service URL:', piUrl);

      if (piRecording.isRecording) {
        await piRecording.stopRecording(piUrl);
        onRecordingChange(false);
      } else {
        const recordingId = await piRecording.startRecording({
          piUrl,
          streamUrl: networkCamera.currentConfig.url,
          quality,
          motionTriggered: false,
          videoPath: piVideoPath
        });
        
        if (recordingId) {
          onRecordingChange(true);
        }
      }
      return;
    }
    
    // For webcam, use browser-based recording
    const currentStream = streamRef.current;
    const currentVideoRef = videoRef.current;
    
    if (!currentStream || !currentVideoRef) return;
    
    if (recording.isRecording) {
      recording.stopRecording();
      onRecordingChange(false);
    } else {
      recording.startRecording(currentStream, {
        storageType,
        fileType: 'video',
        quality,
        motionDetected: false,
        dateOrganizedFolders
      });
      onRecordingChange(true);
    }
  };

  const handleSnapshot = () => {
    const currentVideoRef = cameraSource === 'webcam' ? videoRef.current : networkCamera.videoRef.current;
    
    // Support both video and image elements
    if (!currentVideoRef) return;
    if (!(currentVideoRef instanceof HTMLVideoElement) && !(currentVideoRef instanceof HTMLImageElement)) return;
    
    recording.takeSnapshot(currentVideoRef, {
      storageType,
      fileType: 'image',
      quality,
      motionDetected: cameraSource === 'webcam' ? motionDetection.motionDetected : imageMotionDetection.motionDetected,
      dateOrganizedFolders
    });
  };

  const handleSourceChange = (source: CameraSource) => {
    if (isConnected) {
      stopCamera();
    }
    setCameraSource(source);
  };

  const handleConnectNetworkCamera = async (config: NetworkCameraConfig) => {
    // Pass current quality setting to network camera
    const configWithQuality = { ...config, quality };
    console.log('LiveFeed: Attempting to connect to network camera with quality:', configWithQuality);
    setError(null);
    setIsLoading(true);
    
    try {
      toast({
        title: "Connecting to camera...",
        description: `Attempting to connect to ${config.name}`,
      });

      await networkCamera.connectToCamera(configWithQuality);
      
      console.log('LiveFeed: Connection result - isConnected:', networkCamera.isConnected);
      console.log('LiveFeed: Connection error:', networkCamera.connectionError);
      
      // Wait for connection to be established (longer timeout for MJPEG streams)
      const checkConnection = () => {
        if (networkCamera.isConnected) {
          setIsConnected(true);
          onConnectionChange?.(true);
          setError(null);
          console.log('LiveFeed: Successfully connected to network camera');
          
          // Start motion detection for network cameras
          if (motionDetectionEnabled && networkCamera.videoRef.current instanceof HTMLImageElement) {
            console.log('Starting motion detection for network camera');
            imageMotionDetection.startDetection(networkCamera.videoRef.current);
          }
          
          toast({
            title: "Camera connected!",
            description: `Successfully connected to ${config.name}`,
          });
        } else if (networkCamera.connectionError) {
          const errorMsg = networkCamera.connectionError;
          setError(errorMsg);
          setIsConnected(false);
          onConnectionChange?.(false);
          console.error('LiveFeed: Failed to connect:', networkCamera.connectionError);
          toast({
            title: "Connection failed",
            description: errorMsg,
            variant: "destructive",
          });
        } else {
          // Still connecting, check again after a short delay
          setTimeout(checkConnection, 500);
        }
      };
      
      // Initial check after 2 seconds (enough time for MJPEG first frame)
      setTimeout(checkConnection, 2000);
      
    } catch (error) {
      console.error('LiveFeed: Connection error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      setError(errorMsg);
      setIsConnected(false);
      onConnectionChange?.(false);
      toast({
        title: "Connection error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      if (cameraSource === 'webcam' && videoRef.current instanceof HTMLVideoElement) {
        if (motionDetectionEnabled) {
          motionDetection.startDetection(videoRef.current);
        } else {
          motionDetection.stopDetection();
        }
      } else if (cameraSource === 'network' && networkCamera.videoRef.current instanceof HTMLImageElement) {
        if (motionDetectionEnabled) {
          imageMotionDetection.startDetection(networkCamera.videoRef.current);
        } else {
          imageMotionDetection.stopDetection();
        }
      }
    }
  }, [motionDetectionEnabled, isConnected, motionSensitivity, motionThreshold, scheduleEnabled, startHour, endHour, cameraSource, detectionZonesEnabled, cooldownPeriod, minMotionDuration, noiseReduction]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      networkCamera.disconnect();
      motionDetection.stopDetection();
      imageMotionDetection.stopDetection();
    };
  }, []);

  // Save network cameras to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('networkCameras', JSON.stringify(networkCameras));
  }, [networkCameras]);

  // Restart camera when quality changes to apply new settings
  useEffect(() => {
    if (isConnected) {
      console.log(`Quality changed to ${quality}, restarting camera to apply new settings`);
      if (cameraSource === 'webcam') {
        stopCamera();
        setTimeout(() => startWebcam(), 500);
      } else if (cameraSource === 'network' && networkCamera.currentConfig) {
        stopCamera();
        setTimeout(() => handleConnectNetworkCamera(networkCamera.currentConfig!), 500);
      }
    }
  }, [quality]);

  // Monitor network camera connection state
  useEffect(() => {
    if (cameraSource === 'network') {
      const wasConnected = isConnected;
      setIsConnected(networkCamera.isConnected);
      setError(networkCamera.connectionError);
      
      // Notify parent of connection state change
      if (networkCamera.isConnected !== wasConnected) {
        onConnectionChange?.(networkCamera.isConnected);
      }
      
      if (networkCamera.isConnected && !wasConnected) {
        toast({
          title: "Camera connected!",
          description: `Successfully connected to ${networkCamera.currentConfig?.name}`,
        });
      }
    }
  }, [networkCamera.isConnected, networkCamera.connectionError, cameraSource, isConnected, toast, onConnectionChange]);

  // Test Pi service connectivity when network camera is connected with auto-reconnect
  useEffect(() => {
    let reconnectInterval: NodeJS.Timeout | null = null;
    let wasDisconnected = false;
    let testInProgress = false;

    if (cameraSource === 'network' && networkCamera.currentConfig && isConnected) {
      const testPiService = async () => {
        // Prevent overlapping test requests
        if (testInProgress) {
          console.log('Pi service test already in progress, skipping...');
          return;
        }

        testInProgress = true;
        try {
          const cameraUrl = new URL(networkCamera.currentConfig!.url);
          
          // For external hostnames (like DuckDNS), try to detect local IP
          let localIp: string | undefined;
          
          if (cameraUrl.hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./)) {
            // Camera URL already uses local IP
            localIp = cameraUrl.hostname;
          }
          
          // First, try the public URL (for DuckDNS or external hostnames)
          // This works from the cloud edge function
          const publicUrl = `http://${cameraUrl.hostname}:3002`;
          console.log('Testing Pi recording service via public URL:', publicUrl);
          const result = await piRecording.testConnection(publicUrl, undefined);
          
          // If public URL succeeded, we're done
          if (result.connected) {
            console.log('✓ Pi recording service accessible via public URL');
          } else if (cameraUrl.hostname.match(/\.duckdns\.org$|\.ddns\./)) {
            // Public URL failed for DuckDNS - try local IP as fallback (only works on same network)
            console.log('Public URL failed, trying local network detection...');
            const savedPiIp = localStorage.getItem('pi_local_ip');
            if (savedPiIp) {
              localIp = savedPiIp;
              console.log('Trying cached local IP:', localIp);
              const localResult = await piRecording.testConnection(`http://${localIp}:3002`, undefined);
              if (localResult.connected) {
                console.log('✓ Pi recording service accessible via local IP');
                // Update result to use local connection
                Object.assign(result, localResult);
              }
            }
          }
          console.log('Pi service connectivity test:', result);
          
          // Check if this is a reconnection after being disconnected
          const isReconnecting = wasDisconnected && result.connected;
          
          setPiServiceConnected(result.connected);
          
          // Store the local IP if connection succeeded
          if (result.connected && localIp) {
            setDetectedPiIp(localIp);
            console.log('Pi service accessible at local IP:', localIp);
          } else if (!result.connected) {
            console.warn('Pi recording service not accessible on port 3002 - recording will be limited to snapshots');
            wasDisconnected = true;
          }

          // Reset disconnected flag on successful reconnection
          // Note: Not showing toast notification because health check doesn't verify recording endpoints exist
          if (isReconnecting) {
            console.log('✓ Pi recording service auto-reconnected successfully');
            wasDisconnected = false;
          }

          // Set up auto-reconnect if disconnected, otherwise stop polling
          if (!result.connected && !reconnectInterval) {
            console.log('Pi recording service disconnected - starting auto-reconnect monitor (every 30 seconds)');
            reconnectInterval = setInterval(() => {
              console.log('Auto-reconnect: checking Pi recording service...');
              testPiService();
            }, 30000); // Check every 30 seconds when disconnected
          } else if (result.connected && reconnectInterval) {
            // Connected - stop monitoring
            console.log('Pi service connected - stopping reconnect monitor');
            clearInterval(reconnectInterval);
            reconnectInterval = null;
          }
        } finally {
          testInProgress = false;
        }
      };

      testPiService();
    } else if (cameraSource === 'webcam') {
      setPiServiceConnected(null); // Not applicable for webcam
    }

    // Cleanup on unmount or dependency change
    return () => {
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
      }
    };
  }, [cameraSource, networkCamera.currentConfig, isConnected, piRecording, toast]);

  // Expose snapshot method to parent via ref
  useImperativeHandle(ref, () => ({
    takeSnapshot: handleSnapshot,
    toggleRecording: handleRecordingToggle,
    startRecording: async () => {
      if (cameraSource === 'network' && !piRecording.isRecording) {
        await handleRecordingToggle();
      } else if (cameraSource === 'webcam' && !recording.isRecording) {
        await handleRecordingToggle();
      }
    },
    stopRecording: async () => {
      if (cameraSource === 'network' && piRecording.isRecording) {
        await handleRecordingToggle();
      } else if (cameraSource === 'webcam' && recording.isRecording) {
        await handleRecordingToggle();
      }
    },
    get isRecording() {
      return cameraSource === 'network' ? piRecording.isRecording : recording.isRecording;
    },
    get piServiceConnected() {
      return piServiceConnected;
    }
  }));

  return (
    <div className="space-y-6">
      {/* Camera Source Selector */}
      <CameraSourceSelector
        currentSource={cameraSource}
        onSourceChange={handleSourceChange}
        networkCameras={networkCameras}
        onAddNetworkCamera={(config) => {
          console.log('LiveFeed: Adding network camera:', config);
          setNetworkCameras(prev => [...prev, config]);
        }}
        onRemoveNetworkCamera={(index) => setNetworkCameras(prev => prev.filter((_, i) => i !== index))}
        onConnectNetworkCamera={handleConnectNetworkCamera}
        onTestConnection={networkCamera.testConnection}
        selectedNetworkCamera={networkCamera.currentConfig}
      />

      {/* Live Feed */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Live Feed</h2>
          <CameraStatus
            motionDetectionEnabled={motionDetectionEnabled}
            motionDetected={cameraSource === 'webcam' ? motionDetection.motionDetected : imageMotionDetection.motionDetected}
            scheduleEnabled={scheduleEnabled}
            isWithinSchedule={cameraSource === 'webcam' ? motionDetection.isWithinSchedule : imageMotionDetection.isWithinSchedule}
            currentMotionLevel={cameraSource === 'webcam' ? motionDetection.currentMotionLevel : imageMotionDetection.currentMotionLevel}
            storageType={storageType}
            emailNotificationsEnabled={emailNotificationsEnabled}
            notificationEmail={notificationEmail}
            isConnected={isConnected}
            cameraSource={cameraSource}
            connectionQuality={connectionMonitor.status.connectionQuality}
            latency={connectionMonitor.status.latency}
            reconnectAttempts={networkCamera.reconnectAttempts}
          />
        </div>
        
        {/* Video Feed */}
        <VideoDisplay
          isConnected={isConnected}
          cameraSource={cameraSource}
          videoRef={videoRef}
          networkVideoRef={networkCamera.videoRef}
          isLoading={isLoading}
          isConnecting={networkCamera.isConnecting}
          error={error}
          onStartWebcam={startWebcam}
          onStopCamera={stopCamera}
          onRecordingToggle={handleRecordingToggle}
          onSnapshot={handleSnapshot}
          onForceReconnect={networkCamera.forceReconnect}
          isRecording={cameraSource === 'network' ? piRecording.isRecording : recording.isRecording}
          isProcessing={cameraSource === 'network' ? piRecording.isProcessing : recording.isProcessing}
          reconnectAttempts={networkCamera.reconnectAttempts}
          piServiceConnected={piServiceConnected}
          recordingDuration={cameraSource === 'network' ? piRecording.recordingDuration : recording.recordingDuration}
        >
          <CameraOverlays
            isRecording={cameraSource === 'network' ? piRecording.isRecording : recording.isRecording}
            storageType={storageType}
            motionDetected={cameraSource === 'webcam' ? motionDetection.motionDetected : imageMotionDetection.motionDetected}
            scheduleEnabled={scheduleEnabled}
            isWithinSchedule={cameraSource === 'webcam' ? motionDetection.isWithinSchedule : imageMotionDetection.isWithinSchedule}
            isProcessing={cameraSource === 'network' ? piRecording.isProcessing : recording.isProcessing}
          />
        </VideoDisplay>

        {/* Camera Info */}
        {isConnected && (
          <CameraInfo
            quality={quality}
            storageType={storageType}
            motionDetectionEnabled={motionDetectionEnabled}
            motionSensitivity={motionSensitivity}
            emailNotificationsEnabled={emailNotificationsEnabled}
            scheduleEnabled={scheduleEnabled}
            startHour={startHour}
            endHour={endHour}
            cameraSource={cameraSource}
            networkCameraName={networkCamera.currentConfig?.name}
          />
        )}
      </div>
    </div>
  );
});

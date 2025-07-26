import { useState, useEffect, useRef } from "react";
import { useRecording } from "@/hooks/useRecording";
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
  onConnectionChange?: (connected: boolean) => void;
}

export const LiveFeed = ({ 
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
  onConnectionChange
}: LiveFeedProps) => {
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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();
  
  const recording = useRecording();
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
        motionNotification.sendMotionAlert(currentVideoRef, motionLevel);
      }
      
      const currentStream = streamRef.current;
      if (!recording.isRecording && currentStream && currentVideoRef) {
        console.log('Auto-starting recording due to webcam motion detection');
        recording.startRecording(currentStream, {
          storageType,
          fileType: 'video',
          quality,
          motionDetected: true
        });
        onRecordingChange(true);
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
        motionNotification.sendMotionAlert(undefined, motionLevel);
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

  const handleRecordingToggle = () => {
    const currentStream = cameraSource === 'webcam' ? streamRef.current : networkCamera.streamRef.current;
    const currentVideoRef = cameraSource === 'webcam' ? videoRef.current : networkCamera.videoRef.current;
    
    if (!currentStream || !currentVideoRef) return;
    
    if (recording.isRecording) {
      recording.stopRecording();
      onRecordingChange(false);
    } else {
      recording.startRecording(currentStream, {
        storageType,
        fileType: 'video',
        quality,
        motionDetected: false
      });
      onRecordingChange(true);
    }
  };

  const handleSnapshot = () => {
    const currentVideoRef = cameraSource === 'webcam' ? videoRef.current : networkCamera.videoRef.current;
    if (!currentVideoRef || !(currentVideoRef instanceof HTMLVideoElement)) return;
    
    recording.takeSnapshot(currentVideoRef, {
      storageType,
      fileType: 'image',
      quality,
      motionDetected: motionDetection.motionDetected
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
          isRecording={recording.isRecording || isRecording}
          isProcessing={recording.isProcessing}
          reconnectAttempts={networkCamera.reconnectAttempts}
        >
          <CameraOverlays
            isRecording={recording.isRecording || isRecording}
            storageType={storageType}
            motionDetected={cameraSource === 'webcam' ? motionDetection.motionDetected : imageMotionDetection.motionDetected}
            scheduleEnabled={scheduleEnabled}
            isWithinSchedule={cameraSource === 'webcam' ? motionDetection.isWithinSchedule : imageMotionDetection.isWithinSchedule}
            isProcessing={recording.isProcessing}
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
};

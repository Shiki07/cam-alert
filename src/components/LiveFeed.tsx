import { useState, useEffect, useRef } from "react";
import { useRecording } from "@/hooks/useRecording";
import { useEnhancedMotionDetection } from "@/hooks/useEnhancedMotionDetection";
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
  endHour
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

  const motionDetection = useEnhancedMotionDetection({
    sensitivity: motionSensitivity,
    threshold: motionThreshold,
    enabled: motionDetectionEnabled && isConnected,
    scheduleEnabled,
    startHour,
    endHour,
    onMotionDetected: (motionLevel) => {
      console.log('Motion detected with level:', motionLevel);
      onMotionDetected(true);
      
      const currentVideoRef = cameraSource === 'webcam' ? videoRef.current : networkCamera.videoRef.current;
      if (currentVideoRef && currentVideoRef instanceof HTMLVideoElement) {
        motionNotification.sendMotionAlert(currentVideoRef, motionLevel);
      }
      
      const currentStream = cameraSource === 'webcam' ? streamRef.current : networkCamera.streamRef.current;
      if (!recording.isRecording && currentStream && currentVideoRef) {
        console.log('Auto-starting recording due to motion detection');
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

  const getVideoConstraints = () => {
    switch (quality) {
      case 'high':
        return { width: 1920, height: 1080 };
      case 'medium':
        return { width: 1280, height: 720 };
      case 'low':
        return { width: 640, height: 480 };
      default:
        return { width: 1280, height: 720 };
    }
  };

  const startWebcam = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(),
        audio: true
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsConnected(true);
        
        videoRef.current.onloadedmetadata = () => {
          if (motionDetectionEnabled && videoRef.current) {
            motionDetection.startDetection(videoRef.current);
          }
        };
      }
    } catch (err) {
      console.error('Error accessing webcam:', err);
      setError('Failed to access webcam. Please check permissions.');
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
    console.log('LiveFeed: Attempting to connect to network camera:', config);
    setError(null);
    setIsLoading(true);
    
    try {
      toast({
        title: "Connecting to camera...",
        description: `Attempting to connect to ${config.name}`,
      });

      await networkCamera.connectToCamera(config);
      
      console.log('LiveFeed: Connection result - isConnected:', networkCamera.isConnected);
      console.log('LiveFeed: Connection error:', networkCamera.connectionError);
      
      // Wait a moment for state to update
      setTimeout(() => {
        if (networkCamera.isConnected) {
          setIsConnected(true);
          setError(null);
          console.log('LiveFeed: Successfully connected to network camera');
          toast({
            title: "Camera connected!",
            description: `Successfully connected to ${config.name}`,
          });
        } else {
          const errorMsg = networkCamera.connectionError || 'Failed to connect to network camera';
          setError(errorMsg);
          setIsConnected(false);
          console.error('LiveFeed: Failed to connect:', networkCamera.connectionError);
          toast({
            title: "Connection failed",
            description: errorMsg,
            variant: "destructive",
          });
        }
      }, 1000);
      
    } catch (error) {
      console.error('LiveFeed: Connection error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Connection failed';
      setError(errorMsg);
      setIsConnected(false);
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
    const currentVideoRef = cameraSource === 'webcam' ? videoRef.current : networkCamera.videoRef.current;
    
    if (isConnected && currentVideoRef && currentVideoRef instanceof HTMLVideoElement) {
      if (motionDetectionEnabled) {
        motionDetection.startDetection(currentVideoRef);
      } else {
        motionDetection.stopDetection();
      }
    }
  }, [motionDetectionEnabled, isConnected, motionSensitivity, motionThreshold, scheduleEnabled, startHour, endHour, cameraSource]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      networkCamera.disconnect();
      motionDetection.stopDetection();
    };
  }, []);

  // Save network cameras to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('networkCameras', JSON.stringify(networkCameras));
  }, [networkCameras]);

  // Monitor network camera connection state
  useEffect(() => {
    if (cameraSource === 'network') {
      setIsConnected(networkCamera.isConnected);
      setError(networkCamera.connectionError);
      
      if (networkCamera.isConnected && !isConnected) {
        toast({
          title: "Camera connected!",
          description: `Successfully connected to ${networkCamera.currentConfig?.name}`,
        });
      }
    }
  }, [networkCamera.isConnected, networkCamera.connectionError, cameraSource, isConnected, toast]);

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
            motionDetected={motionDetection.motionDetected}
            scheduleEnabled={scheduleEnabled}
            isWithinSchedule={motionDetection.isWithinSchedule}
            currentMotionLevel={motionDetection.currentMotionLevel}
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
            motionDetected={motionDetection.motionDetected}
            scheduleEnabled={scheduleEnabled}
            isWithinSchedule={motionDetection.isWithinSchedule}
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

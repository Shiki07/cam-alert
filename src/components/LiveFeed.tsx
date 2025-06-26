import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Video, Square, Wifi, WifiOff } from "lucide-react";
import { useRecording } from "@/hooks/useRecording";
import { useEnhancedMotionDetection } from "@/hooks/useEnhancedMotionDetection";
import { useMotionNotification } from "@/hooks/useMotionNotification";
import { useNetworkCamera, NetworkCameraConfig } from "@/hooks/useNetworkCamera";
import { useConnectionMonitor } from "@/hooks/useConnectionMonitor";
import { CameraSourceSelector, CameraSource } from "@/components/CameraSourceSelector";

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
  const [networkCameras, setNetworkCameras] = useState<NetworkCameraConfig[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
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
      if (currentVideoRef) {
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
    if (!currentVideoRef) return;
    
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
    await networkCamera.connectToCamera(config);
    if (networkCamera.isConnected) {
      setIsConnected(true);
      setError(null);
    } else {
      setError(networkCamera.connectionError);
    }
  };

  useEffect(() => {
    const currentVideoRef = cameraSource === 'webcam' ? videoRef.current : networkCamera.videoRef.current;
    
    if (isConnected && currentVideoRef) {
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

  const renderConnectionStatus = () => {
    const quality = connectionMonitor.status.connectionQuality;
    const getStatusColor = () => {
      switch (quality) {
        case 'excellent': return 'text-green-400';
        case 'good': return 'text-yellow-400';
        case 'poor': return 'text-orange-400';
        default: return 'text-red-400';
      }
    };

    return (
      <div className="flex items-center gap-2">
        {cameraSource === 'network' && connectionMonitor.status.latency && (
          <span className="text-xs text-gray-400">
            {connectionMonitor.status.latency}ms
          </span>
        )}
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span className={`text-sm ${getStatusColor()}`}>
          {isConnected ? cameraSource === 'webcam' ? 'Webcam' : 'Network' : 'Disconnected'}
        </span>
        {cameraSource === 'network' && connectionMonitor.status.reconnectAttempts > 0 && (
          <span className="text-xs text-orange-400">
            Retry {connectionMonitor.status.reconnectAttempts}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Camera Source Selector */}
      <CameraSourceSelector
        currentSource={cameraSource}
        onSourceChange={handleSourceChange}
        networkCameras={networkCameras}
        onAddNetworkCamera={(config) => setNetworkCameras(prev => [...prev, config])}
        onRemoveNetworkCamera={(index) => setNetworkCameras(prev => prev.filter((_, i) => i !== index))}
        onConnectNetworkCamera={handleConnectNetworkCamera}
        onTestConnection={networkCamera.testConnection}
        selectedNetworkCamera={networkCamera.currentConfig}
      />

      {/* Live Feed */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Live Feed</h2>
          <div className="flex items-center gap-4">
            {/* Motion Detection Status */}
            {motionDetectionEnabled && (
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  motionDetection.motionDetected ? 'bg-red-500 animate-pulse' : 'bg-gray-500'
                }`}></span>
                <span className="text-xs text-gray-400">
                  {motionDetection.motionDetected ? 'Motion' : scheduleEnabled && !motionDetection.isWithinSchedule ? 'Scheduled' : 'Watching'}
                </span>
                {motionDetection.currentMotionLevel > 0 && (
                  <span className="text-xs text-orange-400">
                    {motionDetection.currentMotionLevel.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
            
            {/* Storage Type Indicator */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                storageType === 'cloud' ? 'bg-blue-500' : 'bg-green-500'
              }`}></span>
              <span className="text-xs text-gray-400">
                {storageType === 'cloud' ? 'Cloud' : 'Local'}
              </span>
            </div>
            
            {/* Email Notification Status */}
            {emailNotificationsEnabled && notificationEmail && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-xs text-gray-400">Email alerts</span>
              </div>
            )}
            
            {renderConnectionStatus()}
          </div>
        </div>
        
        {/* Video Feed */}
        <div className="aspect-video bg-gray-900 rounded-lg border border-gray-600 flex items-center justify-center relative overflow-hidden">
          {isConnected ? (
            <>
              <video
                ref={cameraSource === 'webcam' ? videoRef : networkCamera.videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              
              {/* Recording Indicator */}
              {(recording.isRecording || isRecording) && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                  REC • {storageType.toUpperCase()}
                </div>
              )}
              
              {/* Motion Detection Indicator */}
              {motionDetection.motionDetected && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-orange-600 text-white px-3 py-1 rounded-full text-sm animate-pulse">
                  MOTION DETECTED
                </div>
              )}
              
              {/* Schedule Status */}
              {scheduleEnabled && !motionDetection.isWithinSchedule && (
                <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
                  SCHEDULED MODE
                </div>
              )}
              
              {/* Processing Indicator */}
              {recording.isProcessing && (
                <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm animate-pulse">
                  {storageType === 'cloud' ? 'Uploading to Cloud...' : 'Processing...'}
                </div>
              )}
              
              {/* Timestamp */}
              <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                {new Date().toLocaleTimeString()}
              </div>

              {/* Camera Controls */}
              <div className="absolute bottom-4 left-4 flex gap-2">
                <Button
                  onClick={handleRecordingToggle}
                  size="sm"
                  disabled={recording.isProcessing}
                  className={recording.isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}
                  title={recording.isRecording ? 'Stop recording' : 'Start recording'}
                >
                  {recording.isRecording ? <Square className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                </Button>
                
                <Button
                  onClick={handleSnapshot}
                  size="sm"
                  disabled={recording.isProcessing}
                  className="bg-green-600 hover:bg-green-700"
                  title="Take snapshot"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>

              {/* Stop Camera Button */}
              <div className="absolute top-4 right-4 flex gap-2">
                {cameraSource === 'network' && connectionMonitor.status.reconnectAttempts > 0 && (
                  <Button
                    onClick={connectionMonitor.forceReconnect}
                    size="sm"
                    variant="outline"
                    className="bg-orange-800 bg-opacity-80 border-orange-600 hover:bg-orange-700"
                    title="Force reconnect"
                  >
                    <Wifi className="w-4 h-4" />
                  </Button>
                )}
                
                <Button 
                  onClick={stopCamera}
                  size="sm"
                  variant="outline"
                  className="bg-gray-800 bg-opacity-80 border-gray-600 hover:bg-gray-700"
                  title="Disconnect camera"
                >
                  <CameraOff className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <Camera className="w-16 h-16 text-gray-600 mx-auto mb-2" />
              {error ? (
                <>
                  <p className="text-red-400 mb-4">{error}</p>
                  <Button 
                    onClick={cameraSource === 'webcam' ? startWebcam : undefined}
                    disabled={isLoading || networkCamera.isConnecting}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isLoading || networkCamera.isConnecting ? 'Connecting...' : 'Try Again'}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-gray-400 mb-4">
                    {cameraSource === 'webcam' ? 'Webcam not connected' : 'Network camera not connected'}
                  </p>
                  <p className="text-xs text-gray-500 mb-4">
                    {cameraSource === 'webcam' 
                      ? 'Click to access your webcam' 
                      : 'Select and connect to a network camera above'
                    }
                  </p>
                  {cameraSource === 'webcam' && (
                    <Button 
                      onClick={startWebcam}
                      disabled={isLoading}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isLoading ? 'Connecting...' : 'Connect Webcam'}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Camera Info */}
        {isConnected && (
          <div className="mt-4 bg-gray-700 rounded p-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Resolution:</span>
                  <span className="text-gray-400">
                    {quality === 'high' ? '1080p' : quality === 'medium' ? '720p' : '480p'}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Storage:</span>
                  <span className="text-gray-400">
                    {storageType === 'cloud' ? 'Supabase Cloud' : 'Local Download'}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Motion Detection:</span>
                  <span className="text-gray-400">
                    {motionDetectionEnabled ? `${motionSensitivity}% sensitivity` : 'Disabled'}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-300">Email Alerts:</span>
                  <span className="text-gray-400">
                    {emailNotificationsEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {scheduleEnabled && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-300">Schedule:</span>
                    <span className="text-gray-400">
                      {String(startHour).padStart(2, '0')}:00 - {String(endHour).padStart(2, '0')}:00
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Source:</span>
                  <span className="text-gray-400">
                    {cameraSource === 'webcam' ? 'Webcam' : networkCamera.currentConfig?.name || 'Network'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

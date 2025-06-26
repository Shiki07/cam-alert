
import React from 'react';

interface CameraStatusProps {
  motionDetectionEnabled: boolean;
  motionDetected: boolean;
  scheduleEnabled: boolean;
  isWithinSchedule: boolean;
  currentMotionLevel: number;
  storageType: 'cloud' | 'local';
  emailNotificationsEnabled: boolean;
  notificationEmail: string;
  isConnected: boolean;
  cameraSource: 'webcam' | 'network';
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  latency: number | null;
  reconnectAttempts: number;
}

export const CameraStatus = ({
  motionDetectionEnabled,
  motionDetected,
  scheduleEnabled,
  isWithinSchedule,
  currentMotionLevel,
  storageType,
  emailNotificationsEnabled,
  notificationEmail,
  isConnected,
  cameraSource,
  connectionQuality,
  latency,
  reconnectAttempts
}: CameraStatusProps) => {
  const getStatusColor = () => {
    switch (connectionQuality) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-yellow-400';
      case 'poor': return 'text-orange-400';
      default: return 'text-red-400';
    }
  };

  return (
    <div className="flex items-center gap-4">
      {/* Motion Detection Status */}
      {motionDetectionEnabled && (
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            motionDetected ? 'bg-red-500 animate-pulse' : 'bg-gray-500'
          }`}></span>
          <span className="text-xs text-gray-400">
            {motionDetected ? 'Motion' : scheduleEnabled && !isWithinSchedule ? 'Scheduled' : 'Watching'}
          </span>
          {currentMotionLevel > 0 && (
            <span className="text-xs text-orange-400">
              {currentMotionLevel.toFixed(1)}%
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
      
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        {cameraSource === 'network' && latency && (
          <span className="text-xs text-gray-400">
            {latency}ms
          </span>
        )}
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span className={`text-sm ${getStatusColor()}`}>
          {isConnected ? cameraSource === 'webcam' ? 'Webcam' : 'Network' : 'Disconnected'}
        </span>
        {cameraSource === 'network' && reconnectAttempts > 0 && (
          <span className="text-xs text-orange-400">
            Retry {reconnectAttempts}
          </span>
        )}
      </div>
    </div>
  );
};

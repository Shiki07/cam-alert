
import React from 'react';

interface CameraOverlaysProps {
  isRecording: boolean;
  storageType: 'cloud' | 'local';
  motionDetected: boolean;
  scheduleEnabled: boolean;
  isWithinSchedule: boolean;
  isProcessing: boolean;
}

export const CameraOverlays = ({
  isRecording,
  storageType,
  motionDetected,
  scheduleEnabled,
  isWithinSchedule,
  isProcessing
}: CameraOverlaysProps) => {
  return (
    <>
      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
          REC • {storageType.toUpperCase()}
        </div>
      )}
      
      {/* Motion Detection Indicator */}
      {motionDetected && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-orange-600 text-white px-3 py-1 rounded-full text-sm animate-pulse">
          MOTION DETECTED
        </div>
      )}
      
      {/* Schedule Status */}
      {scheduleEnabled && !isWithinSchedule && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
          SCHEDULED MODE
        </div>
      )}
      
      {/* Processing Indicator */}
      {isProcessing && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm animate-pulse">
          {storageType === 'cloud' ? 'Uploading to Cloud...' : 'Processing...'}
        </div>
      )}
    </>
  );
};


import React from 'react';

interface CameraInfoProps {
  quality: 'high' | 'medium' | 'low';
  storageType: 'supabase' | 'local';
  motionDetectionEnabled: boolean;
  motionSensitivity: number;
  emailNotificationsEnabled: boolean;
  scheduleEnabled: boolean;
  startHour: number;
  endHour: number;
  cameraSource: 'webcam' | 'network';
  networkCameraName?: string;
}

export const CameraInfo = ({
  quality,
  storageType,
  motionDetectionEnabled,
  motionSensitivity,
  emailNotificationsEnabled,
  scheduleEnabled,
  startHour,
  endHour,
  cameraSource,
  networkCameraName
}: CameraInfoProps) => {
  return (
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
              {storageType === 'supabase' ? 'Supabase Storage' : 'Local Download'}
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
              {cameraSource === 'webcam' ? 'Webcam' : networkCameraName || 'Network'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

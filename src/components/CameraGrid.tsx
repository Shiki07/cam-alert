
import { LiveFeed } from "@/components/LiveFeed";
import { CameraControls } from "@/components/CameraControls";
import { MotionDetection } from "@/components/MotionDetection";
import { NotificationSettings } from "@/components/NotificationSettings";
import { StorageSettings } from "@/components/StorageSettings";
import { MotionSettings } from "@/components/MotionSettings";
import { SystemStatus } from "@/components/SystemStatus";

interface CameraGridProps {
  // Live Feed Props
  isRecording: boolean;
  onRecordingChange: (recording: boolean) => void;
  storageType: 'cloud' | 'local';
  quality: 'high' | 'medium' | 'low';
  motionDetectionEnabled: boolean;
  onMotionDetected: (detected: boolean) => void;
  emailNotificationsEnabled: boolean;
  notificationEmail: string;
  motionSensitivity: number;
  motionThreshold: number;
  scheduleEnabled: boolean;
  startHour: number;
  endHour: number;

  // System Status Props
  motionEventsToday: number;
  lastMotionTime: Date | null;

  // Settings Props
  onStorageTypeChange: (type: 'cloud' | 'local') => void;
  onQualityChange: (quality: 'high' | 'medium' | 'low') => void;
  onToggleRecording: () => void;
  motionDetected: boolean;
  onToggleMotionDetection: () => void;
  onSensitivityChange: (sensitivity: number) => void;
  onThresholdChange: (threshold: number) => void;
  onScheduleToggle: () => void;
  onScheduleChange: (start: number, end: number) => void;
  onToggleEmail: () => void;
  onEmailChange: (email: string) => void;
}

export const CameraGrid = ({
  isRecording,
  onRecordingChange,
  storageType,
  quality,
  motionDetectionEnabled,
  onMotionDetected,
  emailNotificationsEnabled,
  notificationEmail,
  motionSensitivity,
  motionThreshold,
  scheduleEnabled,
  startHour,
  endHour,
  motionEventsToday,
  lastMotionTime,
  onStorageTypeChange,
  onQualityChange,
  onToggleRecording,
  motionDetected,
  onToggleMotionDetection,
  onSensitivityChange,
  onThresholdChange,
  onScheduleToggle,
  onScheduleChange,
  onToggleEmail,
  onEmailChange
}: CameraGridProps) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Live Feed - Takes up 2 columns on desktop */}
      <div className="lg:col-span-2">
        <LiveFeed 
          isRecording={isRecording} 
          onRecordingChange={onRecordingChange}
          storageType={storageType}
          quality={quality}
          motionDetectionEnabled={motionDetectionEnabled}
          onMotionDetected={onMotionDetected}
          emailNotificationsEnabled={emailNotificationsEnabled}
          notificationEmail={notificationEmail}
          motionSensitivity={motionSensitivity}
          motionThreshold={motionThreshold}
          scheduleEnabled={scheduleEnabled}
          startHour={startHour}
          endHour={endHour}
        />
      </div>
      
      {/* Controls Column */}
      <div className="lg:col-span-1 space-y-6">
        <SystemStatus
          isConnected={true}
          motionEventsToday={motionEventsToday}
          storageUsed={256}
          storageTotal={1024}
          lastEventTime={lastMotionTime}
        />
        
        <StorageSettings
          storageType={storageType}
          onStorageTypeChange={onStorageTypeChange}
          quality={quality}
          onQualityChange={onQualityChange}
        />
        
        <CameraControls 
          isRecording={isRecording} 
          onToggleRecording={onToggleRecording} 
        />
        
        <MotionDetection 
          motionDetected={motionDetected}
          motionEnabled={motionDetectionEnabled}
          onToggleMotionDetection={onToggleMotionDetection}
          lastMotionTime={lastMotionTime}
        />
        
        <MotionSettings
          sensitivity={motionSensitivity}
          onSensitivityChange={onSensitivityChange}
          threshold={motionThreshold}
          onThresholdChange={onThresholdChange}
          scheduleEnabled={scheduleEnabled}
          onScheduleToggle={onScheduleToggle}
          startHour={startHour}
          endHour={endHour}
          onScheduleChange={onScheduleChange}
        />
        
        <NotificationSettings 
          emailEnabled={emailNotificationsEnabled} 
          onToggleEmail={onToggleEmail}
          onEmailChange={onEmailChange}
          currentEmail={notificationEmail}
        />
      </div>
    </div>
  );
};

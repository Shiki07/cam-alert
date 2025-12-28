import { useState } from "react";
import { LiveFeed } from "@/components/LiveFeed";
import { CameraControls } from "@/components/CameraControls";
import { UnifiedMotionDetection } from "@/components/UnifiedMotionDetection";
import { NotificationSettings } from "@/components/NotificationSettings";
import { StorageSettings } from "@/components/StorageSettings";
import { SystemStatus } from "@/components/SystemStatus";
import { DuckDNSSettings } from "@/components/DuckDNSSettings";
import { CameraSettingsDialog } from "@/components/CameraSettingsDialog";

interface CameraGridProps {
  // Live Feed Props
  isRecording: boolean;
  onRecordingChange: (recording: boolean) => void;
  storageType: 'supabase' | 'local';
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
  
  // Connection Props
  isConnected?: boolean;
  onConnectionChange?: (connected: boolean) => void;

  // Camera Control Actions
  onSnapshot?: () => void;
  liveFeedRef?: React.RefObject<any>;

  // Folder Settings
  dateOrganizedFolders: boolean;
  onDateOrganizedToggle: (enabled: boolean) => void;
  piVideoPath: string;
  onPiVideoPathChange: (path: string) => void;
  dateOrganizedFoldersPi: boolean;
  onDateOrganizedTogglePi: (enabled: boolean) => void;
  storageUsedPercent?: number;
  storageWarningLevel?: 'safe' | 'warning' | 'danger' | 'critical';
  storageLimitGB?: number;

  // Settings Props
  onStorageTypeChange: (type: 'supabase' | 'local') => void;
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
  
  // Advanced Motion Detection Props
  detectionZonesEnabled: boolean;
  onDetectionZonesToggle: (enabled: boolean) => void;
  cooldownPeriod: number;
  onCooldownChange: (value: number) => void;
  minMotionDuration: number;
  onMinDurationChange: (value: number) => void;
  noiseReduction: boolean;
  onNoiseReductionToggle: (enabled: boolean) => void;
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
  isConnected = false,
  onConnectionChange,
  onSnapshot,
  liveFeedRef,
  dateOrganizedFolders,
  onDateOrganizedToggle,
  piVideoPath,
  onPiVideoPathChange,
  dateOrganizedFoldersPi,
  onDateOrganizedTogglePi,
  storageUsedPercent = 0,
  storageWarningLevel = 'safe',
  storageLimitGB = 5,
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
  onEmailChange,
  detectionZonesEnabled,
  onDetectionZonesToggle,
  cooldownPeriod,
  onCooldownChange,
  minMotionDuration,
  onMinDurationChange,
  noiseReduction,
  onNoiseReductionToggle
}: CameraGridProps) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  return (
    <div className="space-y-6">
      {/* Live Feed - Full width */}
      <div className="w-full">
        <LiveFeed 
          ref={liveFeedRef}
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
          detectionZonesEnabled={detectionZonesEnabled}
          cooldownPeriod={cooldownPeriod}
          minMotionDuration={minMotionDuration}
          noiseReduction={noiseReduction}
          dateOrganizedFolders={dateOrganizedFolders}
          piVideoPath={piVideoPath}
          dateOrganizedFoldersPi={dateOrganizedFoldersPi}
          onConnectionChange={onConnectionChange}
        />
      </div>
      
      {/* Controls Grid - Under the feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SystemStatus
          cameraConnected={isConnected}
        />
        
        <DuckDNSSettings />
        
        <StorageSettings
          storageType={storageType}
          onStorageTypeChange={onStorageTypeChange}
          quality={quality}
          onQualityChange={onQualityChange}
        />
        
        <CameraControls 
          isRecording={isRecording} 
          onToggleRecording={onToggleRecording}
          quality={quality}
          isConnected={isConnected}
          storageType={storageType}
          onSnapshot={onSnapshot}
          onShowSettings={() => setSettingsOpen(true)}
          storageUsedPercent={storageUsedPercent}
          storageWarningLevel={storageWarningLevel}
          liveFeedRef={liveFeedRef}
          piServiceConnected={liveFeedRef?.current?.piServiceConnected}
        />
        
        <UnifiedMotionDetection 
          motionDetected={motionDetected}
          motionEnabled={motionDetectionEnabled}
          onToggleMotionDetection={onToggleMotionDetection}
          lastMotionTime={null}
          sensitivity={motionSensitivity}
          onSensitivityChange={onSensitivityChange}
          threshold={motionThreshold}
          onThresholdChange={onThresholdChange}
          scheduleEnabled={scheduleEnabled}
          onScheduleToggle={onScheduleToggle}
          startHour={startHour}
          endHour={endHour}
          onScheduleChange={onScheduleChange}
          detectionZonesEnabled={detectionZonesEnabled}
          onDetectionZonesToggle={onDetectionZonesToggle}
          cooldownPeriod={cooldownPeriod}
          onCooldownChange={onCooldownChange}
          minMotionDuration={minMotionDuration}
          onMinDurationChange={onMinDurationChange}
          noiseReduction={noiseReduction}
          onNoiseReductionToggle={onNoiseReductionToggle}
        />
        
        <NotificationSettings 
          emailEnabled={emailNotificationsEnabled} 
          onToggleEmail={onToggleEmail}
          onEmailChange={onEmailChange}
          currentEmail={notificationEmail}
        />
      </div>

      {/* Settings Dialog */}
      <CameraSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        storageType={storageType}
        onStorageTypeChange={onStorageTypeChange}
        quality={quality}
        onQualityChange={onQualityChange}
        dateOrganizedFolders={dateOrganizedFolders}
        onDateOrganizedToggle={onDateOrganizedToggle}
        piVideoPath={piVideoPath}
        onPiVideoPathChange={onPiVideoPathChange}
        dateOrganizedFoldersPi={dateOrganizedFoldersPi}
        onDateOrganizedTogglePi={onDateOrganizedTogglePi}
        motionDetected={motionDetected}
        motionEnabled={motionDetectionEnabled}
        onToggleMotionDetection={onToggleMotionDetection}
        lastMotionTime={null}
        sensitivity={motionSensitivity}
        onSensitivityChange={onSensitivityChange}
        threshold={motionThreshold}
        onThresholdChange={onThresholdChange}
        scheduleEnabled={scheduleEnabled}
        onScheduleToggle={onScheduleToggle}
        startHour={startHour}
        endHour={endHour}
        onScheduleChange={onScheduleChange}
        detectionZonesEnabled={detectionZonesEnabled}
        onDetectionZonesToggle={onDetectionZonesToggle}
        cooldownPeriod={cooldownPeriod}
        onCooldownChange={onCooldownChange}
        minMotionDuration={minMotionDuration}
        onMinDurationChange={onMinDurationChange}
        noiseReduction={noiseReduction}
        onNoiseReductionToggle={onNoiseReductionToggle}
        emailEnabled={emailNotificationsEnabled}
        onToggleEmail={onToggleEmail}
        onEmailChange={onEmailChange}
        currentEmail={notificationEmail}
      />
    </div>
  );
};


import { useState, useRef } from "react";
import { RecordingHistory } from "@/components/RecordingHistory";
import { CameraGrid } from "@/components/CameraGrid";
import { AuthGuard } from "@/components/AuthGuard";
import Header from "@/components/Header";
import { useCameraSettings } from "@/hooks/useCameraSettings";
import { useEmailSettings } from "@/hooks/useEmailSettings";
import { LiveFeedHandle } from "@/components/LiveFeed";
import { useStorageStats } from "@/hooks/useStorageStats";

const Index = () => {
  const [isConnected, setIsConnected] = useState(false);
  const liveFeedRef = useRef<LiveFeedHandle>(null);
  const { stats: storageStats, storageLimitGB } = useStorageStats();
  
  const {
    // State
    isRecording,
    motionDetected,
    motionDetectionEnabled,
    lastMotionTime,
    emailEnabled,
    notificationEmail,
    quality,
    motionSensitivity,
    motionThreshold,
    scheduleEnabled,
    startHour,
    endHour,
    motionEventsToday,
    detectionZonesEnabled,
    cooldownPeriod,
    minMotionDuration,
    noiseReduction,
    dateOrganizedFolders,
    
    // Setters
    setIsRecording,
    setQuality,
    setMotionSensitivity,
    setMotionThreshold,
    setScheduleEnabled,
    
    // Handlers
    toggleRecording,
    handleMotionDetected,
    toggleMotionDetection,
    toggleEmailNotifications,
    handleEmailChange,
    handleScheduleChange,
    toggleDetectionZones,
    handleCooldownChange,
    handleMinDurationChange,
    toggleNoiseReduction,
    toggleDateOrganizedFolders,
    piVideoPath,
    handlePiVideoPathChange,
    dateOrganizedFoldersPi,
    toggleDateOrganizedFoldersPi
  } = useCameraSettings();

  // Initialize email settings
  useEmailSettings(notificationEmail, handleEmailChange);

  const handleSnapshot = () => {
    liveFeedRef.current?.takeSnapshot();
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-900">
        <Header />
        
        {/* Top Banner - Hidden on mobile for space */}
        <div className="py-2 sm:py-3 hidden sm:block">
          <div className="container mx-auto px-4 text-center">
            <p className="text-muted-foreground text-xs sm:text-sm">
              Want control for more cameras? Visit{" "}
              <a 
                href="https://camerastream.live" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                camerastream.live
              </a>
            </p>
          </div>
        </div>
        
        <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
          <CameraGrid
            isRecording={isRecording}
            onRecordingChange={setIsRecording}
            quality={quality}
            motionDetectionEnabled={motionDetectionEnabled}
            onMotionDetected={handleMotionDetected}
            emailNotificationsEnabled={emailEnabled}
            notificationEmail={notificationEmail}
            motionSensitivity={motionSensitivity}
            motionThreshold={motionThreshold}
            scheduleEnabled={scheduleEnabled}
            startHour={startHour}
            endHour={endHour}
            onQualityChange={setQuality}
            onToggleRecording={toggleRecording}
            motionDetected={motionDetected}
            onToggleMotionDetection={toggleMotionDetection}
            onSensitivityChange={setMotionSensitivity}
            onThresholdChange={setMotionThreshold}
            onScheduleToggle={() => setScheduleEnabled(!scheduleEnabled)}
            onScheduleChange={handleScheduleChange}
            onToggleEmail={toggleEmailNotifications}
            onEmailChange={handleEmailChange}
            detectionZonesEnabled={detectionZonesEnabled}
            onDetectionZonesToggle={toggleDetectionZones}
            cooldownPeriod={cooldownPeriod}
            onCooldownChange={handleCooldownChange}
            minMotionDuration={minMotionDuration}
            onMinDurationChange={handleMinDurationChange}
            noiseReduction={noiseReduction}
            onNoiseReductionToggle={toggleNoiseReduction}
            isConnected={isConnected}
            onConnectionChange={setIsConnected}
            onSnapshot={handleSnapshot}
            liveFeedRef={liveFeedRef}
            dateOrganizedFolders={dateOrganizedFolders}
            onDateOrganizedToggle={toggleDateOrganizedFolders}
            piVideoPath={piVideoPath}
            onPiVideoPathChange={handlePiVideoPathChange}
            dateOrganizedFoldersPi={dateOrganizedFoldersPi}
            onDateOrganizedTogglePi={toggleDateOrganizedFoldersPi}
            storageUsedPercent={storageStats.percentageUsed}
            storageWarningLevel={storageStats.warningLevel}
            storageLimitGB={storageLimitGB}
          />
          
          {/* Recording History - Full width */}
          <div className="lg:col-span-3 mt-4 sm:mt-6">
            <RecordingHistory />
          </div>
        </div>
        
        {/* Support Footer */}
        <footer className="border-t border-border/40 py-4 sm:py-6 mt-6 sm:mt-8">
          <div className="container mx-auto px-4 text-center">
            <p className="text-gray-400 text-xs sm:text-sm">
              Need help?{" "}
              <a 
                href="mailto:support@rpicamalert.xyz" 
                className="text-blue-400 hover:text-blue-300 hover:underline"
              >
                support@rpicamalert.xyz
              </a>
            </p>
          </div>
        </footer>
      </div>
    </AuthGuard>
  );
};

export default Index;


import { RecordingHistory } from "@/components/RecordingHistory";
import { CameraGrid } from "@/components/CameraGrid";
import { AuthGuard } from "@/components/AuthGuard";
import Header from "@/components/Header";
import { useCameraSettings } from "@/hooks/useCameraSettings";
import { useEmailSettings } from "@/hooks/useEmailSettings";

const Index = () => {
  const {
    // State
    isRecording,
    motionDetected,
    motionDetectionEnabled,
    lastMotionTime,
    emailEnabled,
    notificationEmail,
    storageType,
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
    
    // Setters
    setIsRecording,
    setStorageType,
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
    toggleNoiseReduction
  } = useCameraSettings();

  // Initialize email settings
  useEmailSettings(notificationEmail, handleEmailChange);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-900">
        <Header />
        
        <div className="container mx-auto px-4 py-8">
          <CameraGrid
            isRecording={isRecording}
            onRecordingChange={setIsRecording}
            storageType={storageType}
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
            onStorageTypeChange={setStorageType}
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
          />
          
          {/* Recording History - Full width */}
          <div className="lg:col-span-3 mt-6">
            <RecordingHistory />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
};

export default Index;

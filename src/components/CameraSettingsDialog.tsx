import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StorageSettings } from "./StorageSettings";
import { NotificationSettings } from "./NotificationSettings";
import { UnifiedMotionDetection } from "./UnifiedMotionDetection";
import { FolderSettings } from "./FolderSettings";

interface CameraSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  
  // Storage Settings
  storageType: 'cloud' | 'local';
  onStorageTypeChange: (type: 'cloud' | 'local') => void;
  quality: 'high' | 'medium' | 'low';
  onQualityChange: (quality: 'high' | 'medium' | 'low') => void;
  
  // Motion Detection
  motionDetected: boolean;
  motionEnabled: boolean;
  onToggleMotionDetection: () => void;
  lastMotionTime: Date | null;
  sensitivity: number;
  onSensitivityChange: (value: number) => void;
  threshold: number;
  onThresholdChange: (value: number) => void;
  scheduleEnabled: boolean;
  onScheduleToggle: () => void;
  startHour: number;
  endHour: number;
  onScheduleChange: (start: number, end: number) => void;
  detectionZonesEnabled: boolean;
  onDetectionZonesToggle: (enabled: boolean) => void;
  cooldownPeriod: number;
  onCooldownChange: (value: number) => void;
  minMotionDuration: number;
  onMinDurationChange: (value: number) => void;
  noiseReduction: boolean;
  onNoiseReductionToggle: (enabled: boolean) => void;
  
  // Notifications
  emailEnabled: boolean;
  onToggleEmail: () => void;
  onEmailChange: (email: string) => void;
  currentEmail: string;
}

export const CameraSettingsDialog = ({
  open,
  onOpenChange,
  storageType,
  onStorageTypeChange,
  quality,
  onQualityChange,
  motionDetected,
  motionEnabled,
  onToggleMotionDetection,
  lastMotionTime,
  sensitivity,
  onSensitivityChange,
  threshold,
  onThresholdChange,
  scheduleEnabled,
  onScheduleToggle,
  startHour,
  endHour,
  onScheduleChange,
  detectionZonesEnabled,
  onDetectionZonesToggle,
  cooldownPeriod,
  onCooldownChange,
  minMotionDuration,
  onMinDurationChange,
  noiseReduction,
  onNoiseReductionToggle,
  emailEnabled,
  onToggleEmail,
  onEmailChange,
  currentEmail
}: CameraSettingsDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Camera Settings</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Configure your camera recording, motion detection, and notification preferences.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="storage" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-secondary">
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="folder">Folder</TabsTrigger>
            <TabsTrigger value="motion">Motion</TabsTrigger>
            <TabsTrigger value="notifications">Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="storage" className="space-y-4 mt-4">
            <StorageSettings
              storageType={storageType}
              onStorageTypeChange={onStorageTypeChange}
              quality={quality}
              onQualityChange={onQualityChange}
            />
          </TabsContent>

          <TabsContent value="folder" className="space-y-4 mt-4">
            <FolderSettings storageType={storageType} />
          </TabsContent>

          <TabsContent value="motion" className="space-y-4 mt-4">
            <UnifiedMotionDetection
              motionDetected={motionDetected}
              motionEnabled={motionEnabled}
              onToggleMotionDetection={onToggleMotionDetection}
              lastMotionTime={lastMotionTime}
              sensitivity={sensitivity}
              onSensitivityChange={onSensitivityChange}
              threshold={threshold}
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
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4 mt-4">
            <NotificationSettings
              emailEnabled={emailEnabled}
              onToggleEmail={onToggleEmail}
              onEmailChange={onEmailChange}
              currentEmail={currentEmail}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

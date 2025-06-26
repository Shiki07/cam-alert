
import { AdvancedMotionSettings } from "./AdvancedMotionSettings";

interface MotionSettingsProps {
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
}

export const MotionSettings = (props: MotionSettingsProps) => {
  return <AdvancedMotionSettings {...props} />;
};

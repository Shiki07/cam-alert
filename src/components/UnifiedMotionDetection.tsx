import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bell, BellOff, ChevronDown, ChevronUp } from "lucide-react";

interface UnifiedMotionDetectionProps {
  // Basic Motion Detection Props
  motionDetected: boolean;
  motionEnabled: boolean;
  onToggleMotionDetection: () => void;
  lastMotionTime?: Date | null;
  
  // Advanced Motion Settings Props
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

export const UnifiedMotionDetection = ({
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
  onNoiseReductionToggle
}: UnifiedMotionDetectionProps) => {
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);

  const getLastEventText = () => {
    if (!lastMotionTime) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - lastMotionTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    if (diffMins === 0) {
      return diffSecs <= 5 ? 'Just now' : `${diffSecs}s ago`;
    }
    return `${diffMins}m ago`;
  };

  const applyQuickPreset = (presetType: 'indoor' | 'outdoor' | 'night') => {
    const presets = {
      indoor: { sensitivity: 30, threshold: 15, cooldown: 5 },
      outdoor: { sensitivity: 50, threshold: 25, cooldown: 10 },
      night: { sensitivity: 20, threshold: 10, cooldown: 15 }
    };
    
    const preset = presets[presetType];
    onSensitivityChange(preset.sensitivity);
    onThresholdChange(preset.threshold);
    onCooldownChange(preset.cooldown);
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {motionEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          Motion Detection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable Toggle */}
        <Button
          onClick={onToggleMotionDetection}
          variant={motionEnabled ? "default" : "secondary"}
          className="w-full"
        >
          {motionEnabled ? 'Disable Motion Detection' : 'Enable Motion Detection'}
        </Button>

        {motionEnabled && (
          <>
            {/* Status Display */}
            <div className={`p-4 rounded-lg border-2 transition-all ${
              motionDetected 
                ? 'border-destructive bg-destructive/10' 
                : 'border-primary bg-primary/10'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {motionDetected ? 'Motion Detected!' : 'All Clear'}
                </span>
                <span className={`w-3 h-3 rounded-full ${
                  motionDetected ? 'bg-destructive animate-pulse' : 'bg-primary'
                }`}></span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {motionDetected 
                  ? 'Movement detected - Auto recording started' 
                  : 'Monitoring for movement'
                }
              </p>
            </div>

            {/* Basic Settings */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sensitivity: {sensitivity}%</Label>
                <Slider
                  value={[sensitivity]}
                  onValueChange={(value) => onSensitivityChange(value[0])}
                  max={100}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>Threshold: {threshold}%</Label>
                <Slider
                  value={[threshold]}
                  onValueChange={(value) => onThresholdChange(value[0])}
                  max={100}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <Label>Quick Presets</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyQuickPreset('indoor')}
                  >
                    Indoor
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyQuickPreset('outdoor')}
                  >
                    Outdoor
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyQuickPreset('night')}
                  >
                    Night
                  </Button>
                </div>
              </div>
            </div>

            {/* Advanced Settings Collapsible */}
            <Collapsible open={isAdvancedExpanded} onOpenChange={setIsAdvancedExpanded}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="w-full justify-between"
                >
                  Advanced Settings
                  {isAdvancedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                {/* Scheduling */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="schedule"
                      checked={scheduleEnabled}
                      onCheckedChange={onScheduleToggle}
                    />
                    <Label htmlFor="schedule">Enable Detection Schedule</Label>
                  </div>
                  
                  {scheduleEnabled && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Start Hour: {startHour}:00</Label>
                        <Slider
                          value={[startHour]}
                          onValueChange={(value) => onScheduleChange(value[0], endHour)}
                          max={23}
                          min={0}
                          step={1}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>End Hour: {endHour}:00</Label>
                        <Slider
                          value={[endHour]}
                          onValueChange={(value) => onScheduleChange(startHour, value[0])}
                          max={23}
                          min={0}
                          step={1}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Detection Zones */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="detection-zones"
                    checked={detectionZonesEnabled}
                    onCheckedChange={onDetectionZonesToggle}
                  />
                  <Label htmlFor="detection-zones">Custom Detection Zones</Label>
                </div>

                {/* Motion Filters */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Cooldown Period: {cooldownPeriod}s</Label>
                    <Slider
                      value={[cooldownPeriod]}
                      onValueChange={(value) => onCooldownChange(value[0])}
                      max={60}
                      min={1}
                      step={1}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum time between motion alerts
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Min Motion Duration: {minMotionDuration}ms</Label>
                    <Slider
                      value={[minMotionDuration]}
                      onValueChange={(value) => onMinDurationChange(value[0])}
                      max={2000}
                      min={100}
                      step={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum duration to register as motion
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="noise-reduction"
                      checked={noiseReduction}
                      onCheckedChange={onNoiseReductionToggle}
                    />
                    <Label htmlFor="noise-reduction">Noise Reduction</Label>
                  </div>
                </div>

                {/* Status Info */}
                <div className="bg-muted rounded p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Detection Zone:</span>
                    <span>{detectionZonesEnabled ? "Custom" : "Full Frame"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Auto Recording:</span>
                    <span>Enabled</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Event:</span>
                    <span>{getLastEventText()}</span>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
};
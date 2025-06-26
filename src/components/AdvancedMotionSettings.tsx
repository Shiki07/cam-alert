
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, Zap, Clock, Filter, Grid3X3, AlertTriangle } from "lucide-react";
import { useState } from "react";

interface AdvancedMotionSettingsProps {
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

export const AdvancedMotionSettings = ({
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
}: AdvancedMotionSettingsProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Advanced Motion Detection
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white"
          >
            {isExpanded ? "−" : "+"}
          </Button>
        </CardTitle>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-6">
          {/* Sensitivity & Threshold */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <Label className="text-gray-300">
                  Sensitivity: {sensitivity}%
                </Label>
              </div>
              <Slider
                value={[sensitivity]}
                onValueChange={(value) => onSensitivityChange(value[0])}
                max={100}
                min={10}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>Low (10%)</span>
                <span>High (100%)</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-gray-300">
                Detection Threshold: {threshold.toFixed(1)}%
              </Label>
              <Slider
                value={[threshold]}
                onValueChange={(value) => onThresholdChange(value[0])}
                max={5.0}
                min={0.1}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>Very Sensitive (0.1%)</span>
                <span>Less Sensitive (5.0%)</span>
              </div>
            </div>
          </div>

          {/* Detection Zones */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-green-400" />
                <Label className="text-gray-300">
                  Detection Zones
                </Label>
              </div>
              <Switch
                checked={detectionZonesEnabled}
                onCheckedChange={onDetectionZonesToggle}
              />
            </div>
            
            {detectionZonesEnabled && (
              <div className="bg-gray-700 rounded p-4 space-y-3">
                <p className="text-sm text-gray-300">
                  Click and drag on the camera feed to define motion detection zones
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-green-600 p-2 rounded text-center">Zone 1: Active</div>
                  <div className="bg-gray-600 p-2 rounded text-center">Zone 2: Disabled</div>
                  <div className="bg-yellow-600 p-2 rounded text-center">Zone 3: Active</div>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Filters */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-400" />
              <Label className="text-gray-300">Motion Filters</Label>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Label className="text-sm text-gray-300">
                  Cooldown Period: {cooldownPeriod}s
                </Label>
                <Slider
                  value={[cooldownPeriod]}
                  onValueChange={(value) => onCooldownChange(value[0])}
                  max={60}
                  min={1}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">
                  Minimum time between motion alerts
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm text-gray-300">
                  Min Motion Duration: {minMotionDuration}ms
                </Label>
                <Slider
                  value={[minMotionDuration]}
                  onValueChange={(value) => onMinDurationChange(value[0])}
                  max={2000}
                  min={100}
                  step={100}
                  className="w-full"
                />
                <p className="text-xs text-gray-500">
                  Minimum motion duration to trigger alert
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-sm text-gray-300">Noise Reduction</Label>
                <p className="text-xs text-gray-500">Filter out small movements and lighting changes</p>
              </div>
              <Switch
                checked={noiseReduction}
                onCheckedChange={onNoiseReductionToggle}
              />
            </div>
          </div>

          {/* Schedule Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <Label className="text-gray-300">
                  Scheduled Detection
                </Label>
              </div>
              <Switch
                checked={scheduleEnabled}
                onCheckedChange={onScheduleToggle}
              />
            </div>
            
            {scheduleEnabled && (
              <div className="bg-gray-700 rounded p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-gray-300">Start Hour</Label>
                    <Slider
                      value={[startHour]}
                      onValueChange={(value) => onScheduleChange(value[0], endHour)}
                      max={23}
                      min={0}
                      step={1}
                      className="w-full mt-2"
                    />
                    <div className="text-center text-xs text-gray-400 mt-1">
                      {String(startHour).padStart(2, '0')}:00
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-300">End Hour</Label>
                    <Slider
                      value={[endHour]}
                      onValueChange={(value) => onScheduleChange(startHour, value[0])}
                      max={23}
                      min={0}
                      step={1}
                      className="w-full mt-2"
                    />
                    <div className="text-center text-xs text-gray-400 mt-1">
                      {String(endHour).padStart(2, '0')}:00
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Motion detection active from {String(startHour).padStart(2, '0')}:00 to {String(endHour).padStart(2, '0')}:00
                </p>
              </div>
            )}
          </div>

          {/* Motion Presets */}
          <div className="space-y-3">
            <Label className="text-gray-300">Quick Presets</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onSensitivityChange(30);
                  onThresholdChange(2.0);
                  onCooldownChange(10);
                }}
                className="bg-gray-700 border-gray-600 hover:bg-gray-600"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                Conservative
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onSensitivityChange(70);
                  onThresholdChange(0.8);
                  onCooldownChange(5);
                }}
                className="bg-gray-700 border-gray-600 hover:bg-gray-600"
              >
                <Target className="w-3 h-3 mr-1" />
                Balanced
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onSensitivityChange(90);
                  onThresholdChange(0.3);
                  onCooldownChange(2);
                }}
                className="bg-gray-700 border-gray-600 hover:bg-gray-600"
              >
                <Zap className="w-3 h-3 mr-1" />
                Sensitive
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

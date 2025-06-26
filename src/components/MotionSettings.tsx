
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Clock, Target, Zap } from "lucide-react";
import { useState } from "react";

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
}

export const MotionSettings = ({
  sensitivity,
  onSensitivityChange,
  threshold,
  onThresholdChange,
  scheduleEnabled,
  onScheduleToggle,
  startHour,
  endHour,
  onScheduleChange
}: MotionSettingsProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Motion Settings
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
          {/* Sensitivity Setting */}
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

          {/* Threshold Setting */}
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
        </CardContent>
      )}
    </Card>
  );
};

import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Battery, Zap } from 'lucide-react';
import { usePerformance } from '@/contexts/PerformanceContext';

interface LowPowerModeToggleProps {
  compact?: boolean;
}

export const LowPowerModeToggle: React.FC<LowPowerModeToggleProps> = ({ compact = false }) => {
  const { settings, toggleLowPowerMode } = usePerformance();

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {settings.lowPowerMode ? (
          <Battery className="h-4 w-4 text-green-500" />
        ) : (
          <Zap className="h-4 w-4 text-yellow-500" />
        )}
        <Switch
          checked={settings.lowPowerMode}
          onCheckedChange={toggleLowPowerMode}
          aria-label="Toggle low power mode"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-3">
        {settings.lowPowerMode ? (
          <Battery className="h-5 w-5 text-green-500" />
        ) : (
          <Zap className="h-5 w-5 text-yellow-500" />
        )}
        <div>
          <Label htmlFor="low-power-mode" className="text-sm font-medium">
            Low Power Mode
          </Label>
          <p className="text-xs text-muted-foreground">
            {settings.lowPowerMode 
              ? 'Reduced CPU usage, slower motion detection'
              : 'Normal performance, faster detection'
            }
          </p>
        </div>
      </div>
      <Switch
        id="low-power-mode"
        checked={settings.lowPowerMode}
        onCheckedChange={toggleLowPowerMode}
      />
    </div>
  );
};

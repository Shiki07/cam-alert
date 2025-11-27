import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { StorageTier, useStorageStats } from "@/hooks/useStorageStats";
import { Badge } from "@/components/ui/badge";

export const StorageTierSettings = () => {
  const { 
    stats, 
    storageTier, 
    updateStorageTier, 
    formatFileSize,
    storageLimitGB
  } = useStorageStats();

  const getWarningIcon = () => {
    switch (stats.warningLevel) {
      case 'critical':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'danger':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
  };

  const getWarningMessage = () => {
    const { percentageUsed, warningLevel } = stats;
    
    if (warningLevel === 'critical') {
      return {
        message: `Critical: ${percentageUsed}% storage used! Please delete old recordings or upgrade your tier.`,
        className: "bg-red-500/10 border-red-500/50"
      };
    }
    if (warningLevel === 'danger') {
      return {
        message: `Warning: ${percentageUsed}% storage used. Consider cleaning up recordings soon.`,
        className: "bg-orange-500/10 border-orange-500/50"
      };
    }
    if (warningLevel === 'warning') {
      return {
        message: `Notice: ${percentageUsed}% storage used. You're approaching your limit.`,
        className: "bg-yellow-500/10 border-yellow-500/50"
      };
    }
    return {
      message: `Storage healthy: ${percentageUsed}% used (${formatFileSize(stats.totalSizeBytes)} of ${storageLimitGB} GB)`,
      className: "bg-green-500/10 border-green-500/50"
    };
  };

  const getProgressColor = () => {
    switch (stats.warningLevel) {
      case 'critical':
        return 'bg-red-500';
      case 'danger':
        return 'bg-orange-500';
      case 'warning':
        return 'bg-yellow-500';
      default:
        return 'bg-green-500';
    }
  };

  const warningInfo = getWarningMessage();

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-foreground text-lg">Storage Tier</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Choose your storage capacity for cloud recordings
        </p>
      </div>

      {/* Current Usage */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getWarningIcon()}
            <span className="text-sm font-medium text-foreground">
              {stats.percentageUsed}% Used
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            {formatFileSize(stats.totalSizeBytes)} / {storageLimitGB} GB
          </span>
        </div>
        <Progress 
          value={stats.percentageUsed} 
          className="h-2"
          indicatorClassName={getProgressColor()}
        />
      </div>

      {/* Warning Alert */}
      <Alert className={warningInfo.className}>
        <AlertDescription className="flex items-center gap-2">
          {getWarningIcon()}
          {warningInfo.message}
        </AlertDescription>
      </Alert>

      {/* Tier Selection */}
      <RadioGroup
        value={storageTier}
        onValueChange={(value) => updateStorageTier(value as StorageTier)}
        className="space-y-3"
      >
        <div className={`flex items-center space-x-3 rounded-lg border p-4 ${
          storageTier === '5GB' ? 'border-primary bg-primary/5' : 'border-border'
        }`}>
          <RadioGroupItem value="5GB" id="tier-5gb" />
          <div className="flex-1">
            <Label htmlFor="tier-5gb" className="cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">5 GB</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Great for casual use, ~50-100 recordings
              </p>
            </Label>
          </div>
        </div>

        <div className={`flex items-center space-x-3 rounded-lg border p-4 ${
          storageTier === '25GB' ? 'border-primary bg-primary/5' : 'border-border'
        }`}>
          <RadioGroupItem value="25GB" id="tier-25gb" />
          <div className="flex-1">
            <Label htmlFor="tier-25gb" className="cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">25 GB</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Perfect for regular monitoring, ~250-500 recordings
              </p>
            </Label>
          </div>
        </div>

        <div className={`flex items-center space-x-3 rounded-lg border p-4 ${
          storageTier === '100GB' ? 'border-primary bg-primary/5' : 'border-border'
        }`}>
          <RadioGroupItem value="100GB" id="tier-100gb" />
          <div className="flex-1">
            <Label htmlFor="tier-100gb" className="cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">100 GB</span>
              </div>
              <p className="text-sm text-muted-foreground">
                For professional use, ~1000+ recordings
              </p>
            </Label>
          </div>
        </div>
      </RadioGroup>

      {/* Storage Breakdown */}
      <div className="rounded-lg border border-border p-4 space-y-2 bg-secondary/20">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Files:</span>
          <span className="font-medium text-foreground">{stats.totalFiles}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cloud Storage:</span>
          <span className="font-medium text-foreground">
            {formatFileSize(stats.cloudSizeBytes)} ({stats.cloudFiles} files)
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Local Storage:</span>
          <span className="font-medium text-foreground">
            {formatFileSize(stats.localSizeBytes)} ({stats.localFiles} files)
          </span>
        </div>
      </div>
    </div>
  );
};

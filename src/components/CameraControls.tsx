
import { Button } from "@/components/ui/button";
import { Camera, Square, Play, CameraIcon, Settings, Wifi, WifiOff } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface CameraControlsProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  quality?: 'high' | 'medium' | 'low';
  isConnected?: boolean;
  onSnapshot?: () => void;
  onShowSettings?: () => void;
  storageType?: 'cloud' | 'local';
  storageUsedPercent?: number;
}

export const CameraControls = ({ 
  isRecording, 
  onToggleRecording, 
  quality = 'medium',
  isConnected = false,
  onSnapshot,
  onShowSettings,
  storageType = 'cloud',
  storageUsedPercent = 0
}: CameraControlsProps) => {
  const { toast } = useToast();

  const handleSnapshot = () => {
    if (!isConnected) {
      toast({
        title: "Camera not connected",
        description: "Please connect to a camera first",
        variant: "destructive",
      });
      return;
    }
    
    if (onSnapshot) {
      onSnapshot();
      toast({
        title: "Snapshot taken!",
        description: "Image saved successfully",
      });
    }
  };

  const handleSettings = () => {
    if (onShowSettings) {
      onShowSettings();
    } else {
      toast({
        title: "Settings",
        description: "Camera settings panel would open here",
      });
    }
  };

  const getQualityDisplay = () => {
    switch (quality) {
      case 'high': return '1080p HD';
      case 'medium': return '720p';
      case 'low': return '480p';
      default: return '720p';
    }
  };

  const getStorageDisplay = () => {
    const used = Math.round(storageUsedPercent);
    const available = 100 - used;
    
    if (used === 0) {
      return 'Empty';
    }
    
    return `${used}% used (${available}% free)`;
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
        <Camera className="w-5 h-5" />
        Camera Controls
      </h3>
      
      <div className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2 p-2 bg-secondary/20 rounded">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-green-500" />
              <span className="text-sm text-foreground">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Disconnected</span>
            </>
          )}
        </div>

        {/* Record Button */}
        <Button
          onClick={onToggleRecording}
          disabled={!isConnected}
          className={`w-full py-3 font-medium transition-all ${
            isRecording 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-4 h-4 mr-2" />
              Stop Recording
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Recording
            </>
          )}
        </Button>

        {/* Camera Status */}
        <div className="bg-secondary/30 rounded p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Status:</span>
            <span className={`text-sm font-medium ${
              isRecording ? 'text-red-400' : isConnected ? 'text-green-400' : 'text-muted-foreground'
            }`}>
              {isRecording ? 'Recording' : isConnected ? 'Ready' : 'Offline'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Quality:</span>
            <span className="text-sm text-foreground">{getQualityDisplay()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Storage:</span>
            <span className="text-sm text-foreground" title={`Cloud storage limit: 5 GB`}>
              {storageType === 'cloud' ? '☁️ ' : '💾 '}{getStorageDisplay()}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="outline" 
            onClick={handleSnapshot}
            disabled={!isConnected}
            className="text-foreground border-border hover:bg-secondary"
          >
            <CameraIcon className="w-4 h-4 mr-2" />
            Snapshot
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSettings}
            className="text-foreground border-border hover:bg-secondary"
          >
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

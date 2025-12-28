
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
  storageType?: 'supabase' | 'local';
  storageUsedPercent?: number;
  storageWarningLevel?: 'safe' | 'warning' | 'danger' | 'critical';
  liveFeedRef?: React.RefObject<any>;
  piServiceConnected?: boolean | null;
}

export const CameraControls = ({ 
  isRecording, 
  onToggleRecording, 
  quality = 'medium',
  isConnected = false,
  onSnapshot,
  onShowSettings,
  storageType = 'supabase',
  storageUsedPercent = 0,
  storageWarningLevel = 'safe',
  liveFeedRef,
  piServiceConnected
}: CameraControlsProps) => {
  const { toast } = useToast();

  // Use LiveFeed's actual recording state if available for accurate status
  const actualIsRecording = liveFeedRef?.current?.isRecording ?? isRecording;

  const handleToggleRecording = async () => {
    // Check if Pi service is unavailable before attempting network camera recording
    if (piServiceConnected === false && !actualIsRecording) {
      toast({
        title: "Recording service unavailable",
        description: "The Pi recording service is not accessible. Make sure the service is running on port 3002 and the port is forwarded.",
        variant: "destructive"
      });
      return;
    }

    // Use LiveFeed's unified recording logic if available
    if (liveFeedRef?.current?.toggleRecording) {
      try {
        await liveFeedRef.current.toggleRecording();
      } catch (error) {
        console.error('Recording toggle failed:', error);
        toast({
          title: "Recording failed",
          description: error instanceof Error ? error.message : "Failed to toggle recording",
          variant: "destructive"
        });
      }
    } else {
      // Fallback to the old prop-based method
      onToggleRecording();
    }
  };

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

  const getStorageColor = () => {
    switch (storageWarningLevel) {
      case 'critical':
        return 'text-red-500';
      case 'danger':
        return 'text-orange-500';
      case 'warning':
        return 'text-yellow-500';
      default:
        return 'text-green-500';
    }
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

        {/* Pi Service Status Warning (for network cameras) */}
        {piServiceConnected === false && (
          <div className="flex items-center gap-2 p-2 bg-orange-500/20 rounded border border-orange-500/30">
            <WifiOff className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-orange-400">
              Pi recording service unavailable (port 3002)
            </span>
          </div>
        )}

        {/* Record Button */}
        <Button
          onClick={handleToggleRecording}
          disabled={!isConnected}
          className={`w-full py-3 font-medium transition-all ${
            actualIsRecording 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {actualIsRecording ? (
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
              actualIsRecording ? 'text-red-400' : isConnected ? 'text-green-400' : 'text-muted-foreground'
            }`}>
              {actualIsRecording ? 'Recording' : isConnected ? 'Ready' : 'Offline'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Quality:</span>
            <span className="text-sm text-foreground">{getQualityDisplay()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Storage:</span>
            <span className={`text-sm font-medium ${getStorageColor()}`} title="Click Settings to manage storage tier">
              {storageType === 'supabase' ? '☁️ ' : '💾 '}{getStorageDisplay()}
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

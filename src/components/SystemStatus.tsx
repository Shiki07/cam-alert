
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, HardDrive, Wifi, Camera, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { useEffect } from "react";

interface SystemStatusProps {
  // Optional connection status override from camera components
  cameraConnected?: boolean;
}

export const SystemStatus = ({ cameraConnected }: SystemStatusProps) => {
  const { status, loading, updateConnectionStatus, refreshStatus } = useSystemStatus();

  // Update connection status based on camera connectivity
  useEffect(() => {
    if (typeof cameraConnected === 'boolean') {
      updateConnectionStatus(cameraConnected);
    }
  }, [cameraConnected, updateConnectionStatus]);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getLastEventText = () => {
    if (!status.lastEventTime) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - status.lastEventTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins === 0) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${diffHours}h ago`;
  };

  const storagePercentage = (status.storageUsed / status.storageTotal) * 100;

  if (loading) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5" />
          System Status
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshStatus}
            className="ml-auto text-gray-400 hover:text-white"
            title="Refresh system status"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${status.isConnected ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-gray-300">Connection</span>
          </div>
          <span className={`text-sm ${status.isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {status.isConnected ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Camera Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-400" />
            <span className="text-gray-300">Camera</span>
          </div>
          <span className={`text-sm ${status.isConnected ? 'text-green-400' : 'text-gray-400'}`}>
            {status.isConnected ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Motion Events Today */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-400" />
            <span className="text-gray-300">Events Today</span>
          </div>
          <span className="text-sm text-orange-400">{status.motionEventsToday}</span>
        </div>

        {/* Total Recordings */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-400" />
            <span className="text-gray-300">Total Recordings</span>
          </div>
          <span className="text-sm text-blue-400">{status.totalRecordings}</span>
        </div>

        {/* Last Event */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="text-gray-300">Last Event</span>
          </div>
          <span className="text-sm text-purple-400">{getLastEventText()}</span>
        </div>

        {/* Storage Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-cyan-400" />
              <span className="text-gray-300">Storage</span>
            </div>
            <span className="text-sm text-cyan-400">
              {storagePercentage.toFixed(1)}%
            </span>
          </div>
          <Progress value={storagePercentage} className="w-full" />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{status.storageUsed.toFixed(1)} MB used</span>
            <span>{status.storageTotal} MB total</span>
          </div>
        </div>

        {/* System Uptime */}
        <div className="flex items-center justify-between">
          <span className="text-gray-300">Session Time</span>
          <span className="text-sm text-gray-400">{formatUptime(status.uptime)}</span>
        </div>
      </CardContent>
    </Card>
  );
};

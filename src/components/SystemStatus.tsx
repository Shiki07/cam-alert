
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, HardDrive, Wifi, Camera, Clock } from "lucide-react";
import { useEffect, useState } from "react";

interface SystemStatusProps {
  isConnected: boolean;
  motionEventsToday: number;
  storageUsed: number;
  storageTotal: number;
  lastEventTime?: Date | null;
}

export const SystemStatus = ({
  isConnected,
  motionEventsToday,
  storageUsed,
  storageTotal,
  lastEventTime
}: SystemStatusProps) => {
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getLastEventText = () => {
    if (!lastEventTime) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - lastEventTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins === 0) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${diffHours}h ago`;
  };

  const storagePercentage = (storageUsed / storageTotal) * 100;

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Activity className="w-5 h-5" />
          System Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${isConnected ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-gray-300">Connection</span>
          </div>
          <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Camera Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-400" />
            <span className="text-gray-300">Camera</span>
          </div>
          <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-gray-400'}`}>
            {isConnected ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Motion Events Today */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-400" />
            <span className="text-gray-300">Events Today</span>
          </div>
          <span className="text-sm text-orange-400">{motionEventsToday}</span>
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
            <span>{(storageUsed / 1024).toFixed(1)} GB used</span>
            <span>{(storageTotal / 1024).toFixed(1)} GB total</span>
          </div>
        </div>

        {/* System Uptime */}
        <div className="flex items-center justify-between">
          <span className="text-gray-300">Session Time</span>
          <span className="text-sm text-gray-400">{formatUptime(uptime)}</span>
        </div>
      </CardContent>
    </Card>
  );
};

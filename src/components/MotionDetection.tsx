
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";

interface MotionDetectionProps {
  motionDetected: boolean;
  motionEnabled: boolean;
  onToggleMotionDetection: () => void;
  lastMotionTime?: Date | null;
}

export const MotionDetection = ({ 
  motionDetected, 
  motionEnabled, 
  onToggleMotionDetection,
  lastMotionTime 
}: MotionDetectionProps) => {
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

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
        {motionEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        Motion Detection
      </h3>
      
      <div className="space-y-4">
        {/* Enable/Disable Toggle */}
        <Button
          onClick={onToggleMotionDetection}
          className={`w-full ${
            motionEnabled 
              ? 'bg-blue-600 hover:bg-blue-700' 
              : 'bg-gray-600 hover:bg-gray-700'
          }`}
        >
          {motionEnabled ? 'Disable Motion Detection' : 'Enable Motion Detection'}
        </Button>

        {motionEnabled && (
          <>
            {/* Status Display */}
            <div className={`p-4 rounded-lg border-2 transition-all ${
              motionDetected 
                ? 'border-red-500 bg-red-500 bg-opacity-20' 
                : 'border-green-500 bg-green-500 bg-opacity-20'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-white">
                  {motionDetected ? 'Motion Detected!' : 'All Clear'}
                </span>
                <span className={`w-3 h-3 rounded-full ${
                  motionDetected ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                }`}></span>
              </div>
              <p className="text-sm text-gray-300 mt-1">
                {motionDetected 
                  ? 'Movement detected - Auto recording started' 
                  : 'Monitoring for movement'
                }
              </p>
            </div>

            {/* Detection Settings */}
            <div className="bg-gray-700 rounded p-3 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Sensitivity:</span>
                <span className="text-sm text-gray-400">Medium</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Detection Zone:</span>
                <span className="text-sm text-gray-400">Full Frame</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Auto Recording:</span>
                <span className="text-sm text-gray-400">Enabled</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Last Event:</span>
                <span className="text-sm text-gray-400">{getLastEventText()}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

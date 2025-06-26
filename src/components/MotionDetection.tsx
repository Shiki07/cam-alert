
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

interface MotionDetectionProps {
  motionDetected: boolean;
  onToggleMotion: () => void;
}

export const MotionDetection = ({ motionDetected, onToggleMotion }: MotionDetectionProps) => {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
        <Bell className="w-5 h-5" />
        Motion Detection
      </h3>
      
      <div className="space-y-4">
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
              ? 'Movement detected in camera view' 
              : 'No motion detected'
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
            <span className="text-sm text-gray-300">Last Event:</span>
            <span className="text-sm text-gray-400">2 min ago</span>
          </div>
        </div>

        {/* Test Button */}
        <Button
          onClick={onToggleMotion}
          variant="outline"
          className="w-full text-gray-300 border-gray-600 hover:bg-gray-700"
        >
          {motionDetected ? 'Clear Alert' : 'Test Motion'}
        </Button>
      </div>
    </div>
  );
};

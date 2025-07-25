
import { Button } from "@/components/ui/button";
import { Camera, Square, Play } from "lucide-react";

interface CameraControlsProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  quality?: 'high' | 'medium' | 'low';
}

export const CameraControls = ({ isRecording, onToggleRecording, quality = 'medium' }: CameraControlsProps) => {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
        <Camera className="w-5 h-5" />
        Camera Controls
      </h3>
      
      <div className="space-y-4">
        {/* Record Button */}
        <Button
          onClick={onToggleRecording}
          className={`w-full py-3 text-white font-medium transition-all ${
            isRecording 
              ? 'bg-red-600 hover:bg-red-700' 
              : 'bg-green-600 hover:bg-green-700'
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
        <div className="bg-gray-700 rounded p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-300">Status:</span>
            <span className={`text-sm font-medium ${isRecording ? 'text-red-400' : 'text-green-400'}`}>
              {isRecording ? 'Recording' : 'Standby'}
            </span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-300">Quality:</span>
            <span className="text-sm text-gray-400">
              {quality === 'high' ? '1080p' : quality === 'medium' ? '720p' : '480p'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-300">Storage:</span>
            <span className="text-sm text-gray-400">75% available</span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="text-gray-300 border-gray-600 hover:bg-gray-700">
            Snapshot
          </Button>
          <Button variant="outline" className="text-gray-300 border-gray-600 hover:bg-gray-700">
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

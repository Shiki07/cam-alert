
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

interface LiveFeedProps {
  isRecording: boolean;
}

export const LiveFeed = ({ isRecording }: LiveFeedProps) => {
  const [isConnected, setIsConnected] = useState(false);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Live Feed</h2>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-sm text-gray-400">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>
      
      {/* Video Feed Placeholder */}
      <div className="aspect-video bg-gray-900 rounded-lg border border-gray-600 flex items-center justify-center relative overflow-hidden">
        {isConnected ? (
          <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
            <div className="text-center">
              <Camera className="w-16 h-16 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">Live camera feed will appear here</p>
              <p className="text-xs text-gray-500 mt-1">Connect your Raspberry Pi camera</p>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <Camera className="w-16 h-16 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-400 mb-4">Camera not connected</p>
            <Button 
              onClick={() => setIsConnected(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Connect Camera
            </Button>
          </div>
        )}
        
        {/* Recording Indicator */}
        {isRecording && isConnected && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            REC
          </div>
        )}
        
        {/* Timestamp */}
        {isConnected && (
          <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
            {new Date().toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};

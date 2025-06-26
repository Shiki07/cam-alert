
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

interface LiveFeedProps {
  isRecording: boolean;
}

export const LiveFeed = ({ isRecording }: LiveFeedProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsConnected(true);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Failed to access camera. Please check permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsConnected(false);
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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
      
      {/* Video Feed */}
      <div className="aspect-video bg-gray-900 rounded-lg border border-gray-600 flex items-center justify-center relative overflow-hidden">
        {isConnected ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            
            {/* Recording Indicator */}
            {isRecording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                REC
              </div>
            )}
            
            {/* Timestamp */}
            <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
              {new Date().toLocaleTimeString()}
            </div>

            {/* Stop Camera Button */}
            <div className="absolute top-4 right-4">
              <Button 
                onClick={stopCamera}
                size="sm"
                variant="outline"
                className="bg-gray-800 bg-opacity-80 border-gray-600 hover:bg-gray-700"
              >
                <CameraOff className="w-4 h-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <Camera className="w-16 h-16 text-gray-600 mx-auto mb-2" />
            {error ? (
              <>
                <p className="text-red-400 mb-4">{error}</p>
                <Button 
                  onClick={startCamera}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? 'Connecting...' : 'Try Again'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-gray-400 mb-4">Camera not connected</p>
                <p className="text-xs text-gray-500 mb-4">Click to access your webcam</p>
                <Button 
                  onClick={startCamera}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? 'Connecting...' : 'Connect Camera'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Camera Info */}
      {isConnected && (
        <div className="mt-4 bg-gray-700 rounded p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-300">Resolution:</span>
            <span className="text-sm text-gray-400">720p</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-300">Source:</span>
            <span className="text-sm text-gray-400">Webcam</span>
          </div>
        </div>
      )}
    </div>
  );
};

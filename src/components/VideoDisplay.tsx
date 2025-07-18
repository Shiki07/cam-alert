
import React from 'react';
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Video, Square, Wifi } from "lucide-react";

interface VideoDisplayProps {
  isConnected: boolean;
  cameraSource: 'webcam' | 'network';
  videoRef: React.RefObject<HTMLVideoElement>;
  networkVideoRef: React.RefObject<HTMLVideoElement | HTMLImageElement>;
  isLoading: boolean;
  isConnecting: boolean;
  error: string | null;
  onStartWebcam: () => void;
  onStopCamera: () => void;
  onRecordingToggle: () => void;
  onSnapshot: () => void;
  onForceReconnect?: () => void;
  isRecording: boolean;
  isProcessing: boolean;
  reconnectAttempts: number;
  children?: React.ReactNode;
}

export const VideoDisplay = ({
  isConnected,
  cameraSource,
  videoRef,
  networkVideoRef,
  isLoading,
  isConnecting,
  error,
  onStartWebcam,
  onStopCamera,
  onRecordingToggle,
  onSnapshot,
  onForceReconnect,
  isRecording,
  isProcessing,
  reconnectAttempts,
  children
}: VideoDisplayProps) => {
  return (
    <div className="aspect-video bg-gray-900 rounded-lg border border-gray-600 flex items-center justify-center relative overflow-hidden">
      {/* Webcam video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${cameraSource === 'webcam' && isConnected ? 'block' : 'hidden'}`}
      />
      
      {/* Network camera display - use img element for MJPEG streams */}
      {cameraSource === 'network' && (
        <img
          ref={networkVideoRef as React.RefObject<HTMLImageElement>}
          className={`w-full h-full object-cover ${isConnected ? 'block' : 'hidden'}`}
          alt="Network Camera Stream"
        />
      )}

      {isConnected ? (
        <>
          {children}
          
          {/* Connection Status Indicator */}
          {reconnectAttempts > 0 && (
            <div className="absolute top-4 left-4 bg-orange-600 bg-opacity-90 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
              <Wifi className="w-4 h-4 animate-pulse" />
              Reconnecting... ({reconnectAttempts}/5)
            </div>
          )}
          
          {/* Timestamp */}
          <div className="absolute bottom-4 right-4 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
            {new Date().toLocaleTimeString()}
          </div>

          {/* Camera Controls */}
          <div className="absolute bottom-4 left-4 flex gap-2">
            <Button
              onClick={onRecordingToggle}
              size="sm"
              disabled={isProcessing}
              className={isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}
              title={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? <Square className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            </Button>
            
            <Button
              onClick={onSnapshot}
              size="sm"
              disabled={isProcessing}
              className="bg-green-600 hover:bg-green-700"
              title="Take snapshot"
            >
              <Camera className="w-4 h-4" />
            </Button>
          </div>

          {/* Stop Camera Button */}
          <div className="absolute top-4 right-4 flex gap-2">
            {cameraSource === 'network' && reconnectAttempts > 0 && onForceReconnect && (
              <Button
                onClick={onForceReconnect}
                size="sm"
                variant="outline"
                className="bg-orange-800 bg-opacity-80 border-orange-600 hover:bg-orange-700"
                title="Force reconnect"
              >
                <Wifi className="w-4 h-4" />
              </Button>
            )}
            
            <Button 
              onClick={onStopCamera}
              size="sm"
              variant="outline"
              className="bg-gray-800 bg-opacity-80 border-gray-600 hover:bg-gray-700"
              title="Disconnect camera"
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
              <p className="text-red-400 mb-4 max-w-md">{error}</p>
              <Button 
                onClick={cameraSource === 'webcam' ? onStartWebcam : onForceReconnect}
                disabled={isLoading || isConnecting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isLoading || isConnecting ? 'Connecting...' : 'Try Again'}
              </Button>
            </>
          ) : (
            <>
              <p className="text-gray-400 mb-4">
                {cameraSource === 'webcam' ? 'Webcam not connected' : 'Network camera not connected'}
              </p>
              <p className="text-xs text-gray-500 mb-4">
                {cameraSource === 'webcam' 
                  ? 'Click to access your webcam' 
                  : 'Select and connect to a network camera above'
                }
              </p>
              {cameraSource === 'webcam' && (
                <Button 
                  onClick={onStartWebcam}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading ? 'Connecting..' : 'Connect Webcam'}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

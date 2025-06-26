
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LiveFeed } from "@/components/LiveFeed";
import { CameraControls } from "@/components/CameraControls";
import { MotionDetection } from "@/components/MotionDetection";
import { NotificationSettings } from "@/components/NotificationSettings";
import { StorageSettings } from "@/components/StorageSettings";
import { RecordingHistory } from "@/components/RecordingHistory";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [storageType, setStorageType] = useState<'cloud' | 'local'>('cloud');
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('medium');

  console.log('Index component - user:', user?.email, 'loading:', loading);

  useEffect(() => {
    console.log('Index useEffect - user:', user?.email, 'loading:', loading);
    if (!loading && !user) {
      console.log('Redirecting to auth page');
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const toggleMotionDetection = () => {
    setMotionDetected(!motionDetected);
  };

  const toggleEmailNotifications = () => {
    setEmailEnabled(!emailEnabled);
  };

  // Show loading state while checking auth
  if (loading) {
    console.log('Showing loading state');
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading your camera system...</div>
      </div>
    );
  }

  // Show auth prompt if not authenticated
  if (!user) {
    console.log('Showing auth prompt');
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto mb-6 w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">CamAlert</h1>
          <p className="text-gray-300 mb-6">
            Secure remote camera control and monitoring system
          </p>
          <Button onClick={() => navigate("/auth")} className="bg-blue-600 hover:bg-blue-700">
            Sign In to Access Camera
          </Button>
        </div>
      </div>
    );
  }

  console.log('Showing main dashboard for user:', user.email);

  return (
    <div className="min-h-screen bg-gray-900">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Feed - Takes up 2 columns on desktop */}
          <div className="lg:col-span-2">
            <LiveFeed 
              isRecording={isRecording} 
              onRecordingChange={setIsRecording}
              storageType={storageType}
              quality={quality}
            />
          </div>
          
          {/* Controls Column */}
          <div className="lg:col-span-1 space-y-6">
            <StorageSettings
              storageType={storageType}
              onStorageTypeChange={setStorageType}
              quality={quality}
              onQualityChange={setQuality}
            />
            
            <CameraControls 
              isRecording={isRecording} 
              onToggleRecording={toggleRecording} 
            />
            
            <MotionDetection 
              motionDetected={motionDetected} 
              onToggleMotion={toggleMotionDetection} 
            />
            
            <NotificationSettings 
              emailEnabled={emailEnabled} 
              onToggleEmail={toggleEmailNotifications} 
            />
          </div>
          
          {/* Recording History - Full width */}
          <div className="lg:col-span-3">
            <RecordingHistory />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;

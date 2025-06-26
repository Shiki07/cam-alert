import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LiveFeed } from "@/components/LiveFeed";
import { CameraControls } from "@/components/CameraControls";
import { MotionDetection } from "@/components/MotionDetection";
import { NotificationSettings } from "@/components/NotificationSettings";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
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
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  // Show auth prompt if not authenticated
  if (!user) {
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

  return (
    <div className="min-h-screen bg-gray-900">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Feed - Takes up full width on mobile, half on desktop */}
          <div className="lg:col-span-1">
            <LiveFeed isRecording={isRecording} />
          </div>
          
          {/* Controls Column */}
          <div className="lg:col-span-1 space-y-6">
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
        </div>
      </div>
    </div>
  );
};

export default Index;

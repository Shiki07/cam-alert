import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LiveFeed } from "@/components/LiveFeed";
import { CameraControls } from "@/components/CameraControls";
import { MotionDetection } from "@/components/MotionDetection";
import { NotificationSettings } from "@/components/NotificationSettings";
import { StorageSettings } from "@/components/StorageSettings";
import { RecordingHistory } from "@/components/RecordingHistory";
import { MotionSettings } from "@/components/MotionSettings";
import { SystemStatus } from "@/components/SystemStatus";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [motionDetectionEnabled, setMotionDetectionEnabled] = useState(false);
  const [lastMotionTime, setLastMotionTime] = useState<Date | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [storageType, setStorageType] = useState<'cloud' | 'local'>('cloud');
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('medium');
  
  // Enhanced motion detection settings
  const [motionSensitivity, setMotionSensitivity] = useState(70);
  const [motionThreshold, setMotionThreshold] = useState(0.5);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [startHour, setStartHour] = useState(22);
  const [endHour, setEndHour] = useState(6);
  const [motionEventsToday, setMotionEventsToday] = useState(0);

  console.log('Index component - user:', user?.email, 'loading:', loading);

  // Check if we're in a restricted environment (iframe)
  const isRestrictedEnvironment = window.location !== window.parent.location;

  // Load saved email from localStorage on component mount (with error handling)
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('cameraNotificationEmail');
      if (savedEmail) {
        setNotificationEmail(savedEmail);
      } else if (user?.email) {
        setNotificationEmail(user.email);
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
      // Fallback to user email if localStorage is not available
      if (user?.email) {
        setNotificationEmail(user.email);
      }
    }
  }, [user]);

  useEffect(() => {
    console.log('Index useEffect - user:', user?.email, 'loading:', loading);
    
    // In restricted environments, skip auth redirect
    if (isRestrictedEnvironment) {
      console.log('Running in restricted environment, allowing demo access');
      return;
    }
    
    if (!loading && !user) {
      console.log('Redirecting to auth page');
      navigate("/auth");
    }
  }, [user, loading, navigate, isRestrictedEnvironment]);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const handleMotionDetected = (detected: boolean) => {
    setMotionDetected(detected);
    if (detected) {
      setLastMotionTime(new Date());
      setMotionEventsToday(prev => prev + 1);
    }
  };

  const toggleMotionDetection = () => {
    setMotionDetectionEnabled(!motionDetectionEnabled);
    if (!motionDetectionEnabled) {
      setMotionDetected(false);
    }
  };

  const toggleEmailNotifications = () => {
    setEmailEnabled(!emailEnabled);
  };

  const handleEmailChange = (email: string) => {
    setNotificationEmail(email);
  };

  const handleScheduleChange = (start: number, end: number) => {
    setStartHour(start);
    setEndHour(end);
  };

  // Show loading state while checking auth (but not in restricted environments)
  if (loading && !isRestrictedEnvironment) {
    console.log('Showing loading state');
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading your camera system...</div>
      </div>
    );
  }

  // Show auth prompt if not authenticated (but not in restricted environments)
  if (!user && !isRestrictedEnvironment) {
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

  console.log('Showing main dashboard for user:', user?.email || 'demo user');

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
              motionDetectionEnabled={motionDetectionEnabled}
              onMotionDetected={handleMotionDetected}
              emailNotificationsEnabled={emailEnabled}
              notificationEmail={notificationEmail}
              motionSensitivity={motionSensitivity}
              motionThreshold={motionThreshold}
              scheduleEnabled={scheduleEnabled}
              startHour={startHour}
              endHour={endHour}
            />
          </div>
          
          {/* Controls Column */}
          <div className="lg:col-span-1 space-y-6">
            <SystemStatus
              isConnected={true}
              motionEventsToday={motionEventsToday}
              storageUsed={256}
              storageTotal={1024}
              lastMotionTime={lastMotionTime}
            />
            
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
              motionEnabled={motionDetectionEnabled}
              onToggleMotionDetection={toggleMotionDetection}
              lastMotionTime={lastMotionTime}
            />
            
            <MotionSettings
              sensitivity={motionSensitivity}
              onSensitivityChange={setMotionSensitivity}
              threshold={motionThreshold}
              onThresholdChange={setMotionThreshold}
              scheduleEnabled={scheduleEnabled}
              onScheduleToggle={() => setScheduleEnabled(!scheduleEnabled)}
              startHour={startHour}
              endHour={endHour}
              onScheduleChange={handleScheduleChange}
            />
            
            <NotificationSettings 
              emailEnabled={emailEnabled} 
              onToggleEmail={toggleEmailNotifications}
              onEmailChange={handleEmailChange}
              currentEmail={notificationEmail}
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

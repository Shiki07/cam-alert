
import { useState } from "react";
import { CameraControls } from "@/components/CameraControls";
import { MotionDetection } from "@/components/MotionDetection";
import { NotificationSettings } from "@/components/NotificationSettings";
import { LiveFeed } from "@/components/LiveFeed";

const Index = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🏠 Remote Security Camera
          </h1>
          <p className="text-gray-400 mt-1">Monitor your space from anywhere</p>
        </div>
      </header>

      {/* Main Dashboard */}
      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Live Feed Section */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <LiveFeed isRecording={isRecording} />
          </div>
          
          <div className="space-y-6">
            <CameraControls 
              isRecording={isRecording}
              onToggleRecording={() => setIsRecording(!isRecording)}
            />
            
            <MotionDetection 
              motionDetected={motionDetected}
              onToggleMotion={() => setMotionDetected(!motionDetected)}
            />
          </div>
        </div>

        {/* Settings and Notifications */}
        <div className="grid md:grid-cols-2 gap-6">
          <NotificationSettings 
            emailEnabled={emailNotifications}
            onToggleEmail={() => setEmailNotifications(!emailNotifications)}
          />
          
          {/* Recent Events */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h3 className="text-lg font-semibold mb-4 text-white">Recent Events</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
                <div>
                  <p className="text-sm text-white">Motion detected</p>
                  <p className="text-xs text-gray-400">2 minutes ago</p>
                </div>
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
                <div>
                  <p className="text-sm text-white">Recording started</p>
                  <p className="text-xs text-gray-400">5 minutes ago</p>
                </div>
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
                <div>
                  <p className="text-sm text-white">Email sent</p>
                  <p className="text-xs text-gray-400">7 minutes ago</p>
                </div>
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;

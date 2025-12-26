
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMotionNotification } from "@/hooks/useMotionNotification";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Bell, Loader2 } from "lucide-react";
import { getStorageItem, setStorageItem } from "@/utils/secureStorage";

interface NotificationSettingsProps {
  emailEnabled: boolean;
  onToggleEmail: () => void;
  onEmailChange?: (email: string) => void;
  currentEmail?: string;
}

export const NotificationSettings = ({ 
  emailEnabled, 
  onToggleEmail,
  onEmailChange,
  currentEmail = ""
}: NotificationSettingsProps) => {
  const { preferences, savePreferences, isLoading: prefsLoading } = useUserPreferences();
  const [email, setEmail] = useState(currentEmail);
  const [isLoading, setIsLoading] = useState(false);
  // System alerts is non-sensitive UI preference, can stay in localStorage
  const [systemAlerts, setSystemAlerts] = useState(() => 
    getStorageItem('cameraSystemAlerts', true)
  );
  const { toast } = useToast();

  // Sync email from preferences when loaded
  useEffect(() => {
    if (preferences.notification_email && !email) {
      setEmail(preferences.notification_email);
      onEmailChange?.(preferences.notification_email);
    }
  }, [preferences.notification_email, email, onEmailChange]);

  const motionNotification = useMotionNotification({
    email: email,
    enabled: emailEnabled,
    includeAttachment: true
  });

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail);
    onEmailChange?.(newEmail);
  };

  const handleSaveSettings = async () => {
    if (!email) {
      toast({
        title: "Error",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // SECURITY: Save email to database instead of localStorage
      const success = await savePreferences({
        notification_email: email,
        email_notifications_enabled: emailEnabled,
      });
      
      if (success) {
        toast({
          title: "Settings Saved",
          description: "Your notification preferences have been saved securely",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save settings. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  const sendTestEmail = async () => {
    if (!email) {
      toast({
        title: "Error", 
        description: "Please enter your email address first",
        variant: "destructive",
      });
      return;
    }

    if (!emailEnabled) {
      toast({
        title: "Error",
        description: "Please enable email notifications first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      await motionNotification.sendMotionAlert(undefined, 85.5);
      
      toast({
        title: "Test Email Sent",
        description: `Test motion alert sent to ${email}`,
      });
    } catch (error) {
      console.error('Error sending test email:', error);
      toast({
        title: "Test Failed",
        description: "Failed to send test email. Please check your settings.",
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };

  if (prefsLoading) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
        <Bell className="w-5 h-5" />
        Email Notifications
      </h3>
      
      <div className="space-y-4">
        {/* Email Toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="email-notifications" className="text-gray-300">
            Enable email alerts
          </Label>
          <Switch
            id="email-notifications"
            checked={emailEnabled}
            onCheckedChange={onToggleEmail}
          />
        </div>

        {/* Email Input */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-gray-300">
            Email Address
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="your.email@example.com"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
            disabled={!emailEnabled}
          />
        </div>

        {/* Notification Types */}
        <div className="space-y-3">
          <Label className="text-gray-300">Send notifications for:</Label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Motion detection</span>
              <Switch defaultChecked disabled={!emailEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Recording events</span>
              <Switch defaultChecked disabled={!emailEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">System alerts</span>
              <Switch 
                checked={systemAlerts}
                onCheckedChange={(checked) => {
                  setSystemAlerts(checked);
                  // System alerts toggle is non-sensitive, can stay in localStorage
                  setStorageItem('cameraSystemAlerts', checked);
                }}
                disabled={!emailEnabled} 
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button
            onClick={sendTestEmail}
            variant="outline"
            className="text-gray-300 border-gray-600 hover:bg-gray-700"
            disabled={!emailEnabled || isLoading}
          >
            {isLoading ? "Sending..." : "Test Email"}
          </Button>
          <Button
            onClick={handleSaveSettings}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : "Save Settings"}
          </Button>
        </div>

        {/* Status Display */}
        <div className="bg-green-600 bg-opacity-20 border border-green-600 rounded p-3 mt-4">
          <p className="text-green-200 text-sm">
            ✅ Email notifications are ready! Motion alerts will be sent with screenshots when motion is detected.
          </p>
        </div>
      </div>
    </div>
  );
};

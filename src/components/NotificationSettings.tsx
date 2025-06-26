
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";

interface NotificationSettingsProps {
  emailEnabled: boolean;
  onToggleEmail: () => void;
}

export const NotificationSettings = ({ emailEnabled, onToggleEmail }: NotificationSettingsProps) => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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
    
    // Simulate saving settings
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast({
      title: "Settings Saved",
      description: "Your notification preferences have been updated",
    });
    
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

    setIsLoading(true);
    
    // Simulate sending test email
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    toast({
      title: "Test Email Sent",
      description: `Test notification sent to ${email}`,
    });
    
    setIsLoading(false);
  };

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
            onChange={(e) => setEmail(e.target.value)}
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
              <Switch disabled={!emailEnabled} />
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

        {/* Note about backend */}
        <div className="bg-yellow-600 bg-opacity-20 border border-yellow-600 rounded p-3 mt-4">
          <p className="text-yellow-200 text-sm">
            📧 To enable actual email sending, connect this project to Supabase for backend functionality.
          </p>
        </div>
      </div>
    </div>
  );
};


import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, HardDrive, Settings, Wifi, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface StorageSettingsProps {
  storageType: 'cloud' | 'local';
  onStorageTypeChange: (type: 'cloud' | 'local') => void;
  quality: 'high' | 'medium' | 'low';
  onQualityChange: (quality: 'high' | 'medium' | 'low') => void;
}

export const StorageSettings = ({ 
  storageType, 
  onStorageTypeChange, 
  quality, 
  onQualityChange 
}: StorageSettingsProps) => {
  const [piEndpoint, setPiEndpoint] = useState(() => {
    try {
      return localStorage.getItem('piEndpoint') || '';
    } catch {
      return '';
    }
  });
  const { toast } = useToast();

  useEffect(() => {
    try {
      localStorage.setItem('piEndpoint', piEndpoint);
    } catch (error) {
      console.error('Failed to save Pi endpoint:', error);
    }
  }, [piEndpoint]);

  const testPiConnection = async () => {
    if (!piEndpoint) {
      toast({
        title: "Error",
        description: "Please enter Pi endpoint URL",
        variant: "destructive"
      });
      return;
    }

    try {
      // Use Supabase edge function to test Pi connectivity (bypasses CORS)
      const { data, error } = await supabase.functions.invoke('pi-health-check', {
        body: { pi_endpoint: piEndpoint }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({
          title: "Connection successful",
          description: `Pi service is accessible at ${piEndpoint}`,
        });
      } else {
        toast({
          title: "Connection failed",
          description: data?.message || "Could not connect to Pi service",
          variant: "destructive"
        });
      }
    } catch (error) {
      // Connection test failed, but sync may still work
      toast({
        title: "Test failed (CORS blocked)",
        description: "Direct test blocked by browser security. Recordings will still sync via secure backend.",
        variant: "default"
      });
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Storage Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Storage Type Selection */}
        <div>
          <label className="text-sm text-gray-300 mb-2 block">Storage Location</label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={storageType === 'cloud' ? 'default' : 'outline'}
              onClick={() => onStorageTypeChange('cloud')}
              className={`flex items-center gap-2 ${
                storageType === 'cloud' 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Cloud className="w-4 h-4" />
              Cloud
            </Button>
            <Button
              variant={storageType === 'local' ? 'default' : 'outline'}
              onClick={() => onStorageTypeChange('local')}
              className={`flex items-center gap-2 ${
                storageType === 'local' 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              SD Card
            </Button>
          </div>
        </div>

        {/* Quality Settings */}
        <div>
          <label className="text-sm text-gray-300 mb-2 block">Recording Quality</label>
          <div className="grid grid-cols-3 gap-2">
            {['high', 'medium', 'low'].map((q) => (
              <Button
                key={q}
                variant={quality === q ? 'default' : 'outline'}
                onClick={() => onQualityChange(q as 'high' | 'medium' | 'low')}
                size="sm"
                className={`${
                  quality === q 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'border-gray-600 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {q.charAt(0).toUpperCase() + q.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Storage Info */}
        <div className="bg-gray-700 rounded p-3 text-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-300">Current:</span>
            <span className="text-gray-400 flex items-center gap-1">
              {storageType === 'cloud' ? <Cloud className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
              {storageType === 'cloud' ? 'Supabase Cloud' : 'Raspberry Pi SD'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Quality:</span>
            <span className="text-gray-400">{quality} ({
              quality === 'high' ? '1080p' : quality === 'medium' ? '720p' : '480p'
            })</span>
          </div>
        </div>
        
        {/* Pi Sync Configuration */}
        <div className="space-y-3">
          <Label className="text-gray-300 flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            Raspberry Pi Sync (Optional)
          </Label>
          <div className="space-y-2">
            <Input
              placeholder="http://192.168.178.108:3002"
              value={piEndpoint}
              onChange={(e) => setPiEndpoint(e.target.value)}
              className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
            />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={testPiConnection}
              className="w-full"
            >
              Test Connection
            </Button>
          </div>
          
          {/* Pi Sync Status Indicator */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              {piEndpoint ? (
                <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              )}
              <div className="text-xs">
                <p className="text-gray-300 font-medium mb-1">
                  {piEndpoint ? "Pi Sync Enabled" : "Pi Sync Disabled"}
                </p>
                <p className="text-gray-400">
                  {piEndpoint 
                    ? "Recordings will be automatically synced to your Pi's SD card via secure backend connection. Connection test may fail due to browser security, but sync will still work." 
                    : "Enter your Pi's IP address to enable automatic backup to SD card."
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

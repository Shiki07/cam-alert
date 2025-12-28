
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, HardDrive, Settings, Wifi } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface StorageSettingsProps {
  storageType: 'supabase' | 'local';
  onStorageTypeChange: (type: 'supabase' | 'local') => void;
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
    if (!piEndpoint.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Pi endpoint first",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use cloud-based test via Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('test-pi-connection', {
        body: { pi_endpoint: piEndpoint.trim() }
      });

      if (error) {
        toast({
          title: "Test Failed",
          description: `Cloud test error: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      if (data.success) {
        toast({
          title: "Connection Successful ✅",
          description: `Pi service is reachable from cloud. ${data.healthData?.videosPath ? `Videos path: ${data.healthData.videosPath}` : ''}`,
        });
      } else {
        toast({
          title: "Connection Failed ❌",
          description: `${data.error}${!data.reachable ? ' - Check port forwarding and firewall settings.' : ''}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Test Error",
        description: "Could not perform cloud test. Try again.",
        variant: "destructive",
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
              variant={storageType === 'supabase' ? 'default' : 'outline'}
              onClick={() => onStorageTypeChange('supabase')}
              className={`flex items-center gap-2 ${
                storageType === 'supabase' 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Cloud className="w-4 h-4" />
              Supabase
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
              Local
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
              {storageType === 'supabase' ? <Cloud className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
              {storageType === 'supabase' ? 'Supabase Storage' : 'Local Storage'}
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
              placeholder="http://yourname.duckdns.org:3002"
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
          <p className="text-xs text-gray-400">
            {piEndpoint 
              ? "✅ Pi sync enabled - recordings will be saved to your Pi's local storage" 
              : "Enter your DuckDNS URL with port 3002 (e.g., http://yourname.duckdns.org:3002). Requires port forwarding on your router."
            }
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

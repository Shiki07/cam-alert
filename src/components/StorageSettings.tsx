
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, HardDrive, Settings, Wifi } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
      // Ensure we use HTTP for local Pi connections
      const endpoint = piEndpoint.startsWith('https://') 
        ? piEndpoint.replace('https://', 'http://') 
        : piEndpoint;
      const response = await fetch(`${endpoint}/health`);
      const data = await response.json();
      
      toast({
        title: "Connection successful",
        description: `Connected to Pi service at ${piEndpoint}`,
      });
    } catch (error) {
      toast({
        title: "Connection failed", 
        description: "Could not connect to Pi service. Check the URL and ensure the service is running.",
        variant: "destructive"
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
          <p className="text-xs text-gray-400">
            {piEndpoint 
              ? "✅ Pi sync enabled - recordings will be saved to your Pi's SD card" 
              : "Enter your Pi's IP address to enable automatic sync to SD card"
            }
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

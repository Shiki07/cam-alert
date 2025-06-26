
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Cloud, HardDrive, Settings } from 'lucide-react';

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
  const [isExpanded, setIsExpanded] = useState(false);

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
      </CardContent>
    </Card>
  );
};

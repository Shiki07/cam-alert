import { Folder, FolderOpen, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useDirectoryPicker } from "@/hooks/useDirectoryPicker";
import { Capacitor } from "@capacitor/core";
import { getFolderDescription } from "@/utils/folderStructure";

interface FolderSettingsProps {
  storageType: 'cloud' | 'local';
  onMobileFolderChange?: (folder: string) => void;
  currentMobileFolder?: string;
  dateOrganizedFolders: boolean;
  onDateOrganizedToggle: (enabled: boolean) => void;
  piVideoPath: string;
  onPiVideoPathChange: (path: string) => void;
  dateOrganizedFoldersPi: boolean;
  onDateOrganizedTogglePi: (enabled: boolean) => void;
}

export const FolderSettings = ({ 
  storageType,
  onMobileFolderChange,
  currentMobileFolder,
  dateOrganizedFolders,
  onDateOrganizedToggle,
  piVideoPath,
  onPiVideoPathChange,
  dateOrganizedFoldersPi,
  onDateOrganizedTogglePi
}: FolderSettingsProps) => {
  const { 
    directoryPath, 
    isSupported, 
    pickDirectory, 
    clearDirectory,
    getStoredDirectoryName
  } = useDirectoryPicker();

  const isNative = Capacitor.isNativePlatform();
  const isMobile = Capacitor.getPlatform() !== 'web';
  const storedName = getStoredDirectoryName();

  if (storageType !== 'local') {
    return null;
  }

  const folderExample = getFolderDescription({ 
    dateOrganized: dateOrganizedFolders, 
    motionDetected: false 
  });

  // Mobile folder selection
  if (isNative || isMobile) {
    return (
      <div className="space-y-6">
        {/* Webcam Section */}
        <div className="space-y-4 p-4 border border-border rounded-lg bg-secondary/10">
          <div>
            <Label className="text-foreground text-lg flex items-center gap-2">
              🖥️ Webcam Recordings
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              Local device storage for webcam recordings
            </p>
          </div>

          {/* Date Organization Toggle */}
          <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-primary" />
              <div>
                <Label className="text-foreground">Organize by Date</Label>
                <p className="text-xs text-muted-foreground">
                  {dateOrganizedFolders ? folderExample : 'Videos/Motion/ or Videos/Manual/'}
                </p>
              </div>
            </div>
            <Switch
              checked={dateOrganizedFolders}
              onCheckedChange={onDateOrganizedToggle}
            />
          </div>

          {!dateOrganizedFolders && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => onMobileFolderChange?.('Videos/Manual')}
                  className={`flex-1 ${currentMobileFolder === 'Videos/Manual' ? 'border-primary' : ''}`}
                >
                  <Folder className="w-4 h-4 mr-2" />
                  Manual
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onMobileFolderChange?.('Videos/Motion')}
                  className={`flex-1 ${currentMobileFolder === 'Videos/Motion' ? 'border-primary' : ''}`}
                >
                  <Folder className="w-4 h-4 mr-2" />
                  Motion
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Pi Camera Section */}
        <div className="space-y-4 p-4 border border-border rounded-lg bg-secondary/10">
          <div>
            <Label className="text-foreground text-lg flex items-center gap-2">
              🍓 Raspberry Pi Recordings
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              Storage path on Raspberry Pi device
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Video Path on Pi</Label>
            <input
              type="text"
              value={piVideoPath}
              onChange={(e) => onPiVideoPathChange(e.target.value)}
              placeholder="/home/pi/Videos"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Full path where recordings will be saved on the Raspberry Pi
            </p>
          </div>

          {/* Date Organization Toggle for Pi */}
          <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-primary" />
              <div>
                <Label className="text-foreground">Organize by Date</Label>
                <p className="text-xs text-muted-foreground">
                  {dateOrganizedFoldersPi ? getFolderDescription({ dateOrganized: true, motionDetected: false }) : 'Flat folder structure'}
                </p>
              </div>
            </div>
            <Switch
              checked={dateOrganizedFoldersPi}
              onCheckedChange={onDateOrganizedTogglePi}
            />
          </div>
        </div>
      </div>
    );
  }

  // Web browser folder selection
  return (
    <div className="space-y-6">
      {/* Webcam Section */}
      <div className="space-y-4 p-4 border border-border rounded-lg bg-secondary/10">
        <div>
          <Label className="text-foreground text-lg flex items-center gap-2">
            🖥️ Webcam Recordings
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            {isSupported 
              ? "Select a folder and organize recordings by date"
              : "Your browser will save files to the default Downloads folder"
            }
          </p>
        </div>

        {/* Date Organization Toggle */}
        <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary" />
            <div>
              <Label className="text-foreground">Organize by Date</Label>
              <p className="text-xs text-muted-foreground">
                {dateOrganizedFolders ? folderExample : 'Flat folder structure'}
              </p>
            </div>
          </div>
          <Switch
            checked={dateOrganizedFolders}
            onCheckedChange={onDateOrganizedToggle}
          />
        </div>

        {!isSupported && (
          <Alert>
            <AlertDescription>
              For better folder control, use Chrome or Edge browser. Other browsers will save to your default Downloads folder.
            </AlertDescription>
          </Alert>
        )}

        {isSupported && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={pickDirectory}
                className="flex-1 text-foreground border-border hover:bg-secondary"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                {directoryPath || storedName ? 'Change Folder' : 'Select Folder'}
              </Button>

              {(directoryPath || storedName) && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={clearDirectory}
                  className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                  title="Clear folder selection"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {(directoryPath || storedName) && (
              <Alert className="bg-primary/10 border-primary/20">
                <Folder className="w-4 h-4" />
                <AlertDescription>
                  Saving to: <strong>{directoryPath || storedName}</strong>
                </AlertDescription>
              </Alert>
            )}

            {!directoryPath && !storedName && (
              <Alert>
                <AlertDescription>
                  No folder selected. Files will be downloaded to your browser's default Downloads folder.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>

      {/* Pi Camera Section */}
      <div className="space-y-4 p-4 border border-border rounded-lg bg-secondary/10">
        <div>
          <Label className="text-foreground text-lg flex items-center gap-2">
            🍓 Raspberry Pi Recordings
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            Storage path on Raspberry Pi device
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-foreground">Video Path on Pi</Label>
          <input
            type="text"
            value={piVideoPath}
            onChange={(e) => onPiVideoPathChange(e.target.value)}
            placeholder="/home/pi/Videos"
            className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground"
          />
          <p className="text-xs text-muted-foreground">
            Full path where recordings will be saved on the Raspberry Pi
          </p>
        </div>

        {/* Date Organization Toggle for Pi */}
        <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary" />
            <div>
              <Label className="text-foreground">Organize by Date</Label>
              <p className="text-xs text-muted-foreground">
                {dateOrganizedFoldersPi ? getFolderDescription({ dateOrganized: true, motionDetected: false }) : 'Flat folder structure'}
              </p>
            </div>
          </div>
          <Switch
            checked={dateOrganizedFoldersPi}
            onCheckedChange={onDateOrganizedTogglePi}
          />
        </div>
      </div>
    </div>
  );
};

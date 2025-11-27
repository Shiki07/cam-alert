import { Folder, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDirectoryPicker } from "@/hooks/useDirectoryPicker";
import { Capacitor } from "@capacitor/core";

interface FolderSettingsProps {
  storageType: 'cloud' | 'local';
  onMobileFolderChange?: (folder: string) => void;
  currentMobileFolder?: string;
}

export const FolderSettings = ({ 
  storageType,
  onMobileFolderChange,
  currentMobileFolder
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

  // Mobile folder selection
  if (isNative || isMobile) {
    return (
      <div className="space-y-4">
        <div>
          <Label className="text-foreground">Recording Folder (Mobile)</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Choose where to save recordings on your device
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onMobileFolderChange?.('Videos/Manual')}
              className={`flex-1 ${currentMobileFolder === 'Videos/Manual' ? 'border-primary' : ''}`}
            >
              <Folder className="w-4 h-4 mr-2" />
              Manual Recordings
            </Button>
            <Button
              variant="outline"
              onClick={() => onMobileFolderChange?.('Videos/Motion')}
              className={`flex-1 ${currentMobileFolder === 'Videos/Motion' ? 'border-primary' : ''}`}
            >
              <Folder className="w-4 h-4 mr-2" />
              Motion Recordings
            </Button>
          </div>

          {currentMobileFolder && (
            <Alert>
              <AlertDescription>
                Current folder: <strong>{currentMobileFolder}</strong>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    );
  }

  // Web browser folder selection
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-foreground">Download Folder (Browser)</Label>
        <p className="text-sm text-muted-foreground mt-1">
          {isSupported 
            ? "Select a folder to save recordings directly (Chrome/Edge recommended)"
            : "Your browser will save files to the default Downloads folder"
          }
        </p>
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
  );
};

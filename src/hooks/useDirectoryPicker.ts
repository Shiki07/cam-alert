import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface DirectoryPickerState {
  directoryHandle: FileSystemDirectoryHandle | null;
  directoryPath: string | null;
  isSupported: boolean;
}

export const useDirectoryPicker = () => {
  const { toast } = useToast();
  const [state, setState] = useState<DirectoryPickerState>({
    directoryHandle: null,
    directoryPath: null,
    isSupported: 'showDirectoryPicker' in window
  });

  const pickDirectory = useCallback(async () => {
    if (!state.isSupported) {
      toast({
        title: "Not Supported",
        description: "Your browser doesn't support folder selection. Files will be downloaded to your default Downloads folder.",
        variant: "destructive",
      });
      return null;
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'downloads'
      });

      // Verify we have write permission
      const permissionStatus = await dirHandle.queryPermission({ mode: 'readwrite' });
      
      if (permissionStatus !== 'granted') {
        const requestStatus = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (requestStatus !== 'granted') {
          toast({
            title: "Permission Denied",
            description: "Write permission is required to save recordings.",
            variant: "destructive",
          });
          return null;
        }
      }

      setState({
        directoryHandle: dirHandle,
        directoryPath: dirHandle.name,
        isSupported: true
      });

      // Save to localStorage
      try {
        localStorage.setItem('selectedDirectoryName', dirHandle.name);
      } catch (error) {
        console.error('Error saving directory to localStorage:', error);
      }

      toast({
        title: "Folder Selected",
        description: `Recordings will be saved to: ${dirHandle.name}`,
      });

      return dirHandle;
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error selecting directory:', error);
        toast({
          title: "Error",
          description: "Failed to select folder. Please try again.",
          variant: "destructive",
        });
      }
      return null;
    }
  }, [state.isSupported, toast]);

  const saveFileToDirectory = useCallback(async (
    blob: Blob,
    filename: string
  ): Promise<boolean> => {
    if (!state.directoryHandle) {
      console.log('No directory selected, falling back to regular download');
      return false;
    }

    try {
      // Create the file in the selected directory
      const fileHandle = await state.directoryHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      return true;
    } catch (error) {
      console.error('Error saving file to directory:', error);
      toast({
        title: "Save Error",
        description: "Failed to save to selected folder. Using default download location.",
        variant: "destructive",
      });
      return false;
    }
  }, [state.directoryHandle, toast]);

  const clearDirectory = useCallback(() => {
    setState({
      directoryHandle: null,
      directoryPath: null,
      isSupported: state.isSupported
    });
    
    try {
      localStorage.removeItem('selectedDirectoryName');
    } catch (error) {
      console.error('Error clearing directory from localStorage:', error);
    }

    toast({
      title: "Folder Cleared",
      description: "Recordings will use the default download location.",
    });
  }, [state.isSupported, toast]);

  // Try to restore directory name from localStorage on mount
  const getStoredDirectoryName = useCallback(() => {
    try {
      return localStorage.getItem('selectedDirectoryName');
    } catch (error) {
      console.error('Error reading directory from localStorage:', error);
      return null;
    }
  }, []);

  return {
    ...state,
    pickDirectory,
    saveFileToDirectory,
    clearDirectory,
    getStoredDirectoryName
  };
};

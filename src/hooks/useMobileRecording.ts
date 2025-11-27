import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getRecordingPath } from '@/utils/folderStructure';

export const useMobileRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const isNativePlatform = Capacitor.isNativePlatform();

  const saveToDeviceStorage = useCallback(async (
    blob: Blob, 
    filename: string, 
    motionDetected: boolean = false,
    customFolder?: string,
    dateOrganizedFolders: boolean = true
  ) => {
    if (!isNativePlatform) {
      throw new Error('Device storage only available on mobile platforms');
    }

    try {
      // Convert blob to base64
      const base64Data = await blobToBase64(blob);
      
      // Use custom folder if provided, otherwise use organized path
      const folderPath = customFolder || getRecordingPath({
        basePath: 'Videos',
        dateOrganized: dateOrganizedFolders,
        motionDetected
      });
      
      // Save to device storage
      const result = await Filesystem.writeFile({
        path: `${folderPath}/${filename}`,
        data: base64Data,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      // Save metadata to database
      const { error: dbError } = await supabase
        .from('recordings')
        .insert({
          user_id: user!.id,
          filename,
          file_type: 'video',
          storage_type: 'local',
          file_path: result.uri,
          file_size: blob.size,
          motion_detected: motionDetected
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw dbError;
      }

      toast({
        title: "Saved to device",
        description: `Video saved to ${folderPath}/${filename}`,
      });

      return result.uri;
    } catch (error) {
      console.error('Error saving to device storage:', error);
      throw error;
    }
  }, [isNativePlatform, user, toast]);

  const createVideoFolder = useCallback(async () => {
    if (!isNativePlatform) return;

    try {
      // Ensure Videos folder exists
      await Filesystem.mkdir({
        path: 'Videos',
        directory: Directory.Documents,
        recursive: true
      });

      // Create subfolders
      await Filesystem.mkdir({
        path: 'Videos/Motion',
        directory: Directory.Documents,
        recursive: true
      });

      await Filesystem.mkdir({
        path: 'Videos/Manual',
        directory: Directory.Documents,
        recursive: true
      });

      console.log('Video folders created successfully');
    } catch (error) {
      console.error('Error creating video folders:', error);
    }
  }, [isNativePlatform]);

  const listRecordings = useCallback(async () => {
    if (!isNativePlatform) return [];

    try {
      const motionFiles = await Filesystem.readdir({
        path: 'Videos/Motion',
        directory: Directory.Documents
      });

      const manualFiles = await Filesystem.readdir({
        path: 'Videos/Manual', 
        directory: Directory.Documents
      });

      return [
        ...motionFiles.files.map(f => ({ ...f, type: 'motion' })),
        ...manualFiles.files.map(f => ({ ...f, type: 'manual' }))
      ];
    } catch (error) {
      console.error('Error listing recordings:', error);
      return [];
    }
  }, [isNativePlatform]);

  const getStorageInfo = useCallback(async () => {
    if (!isNativePlatform) return null;

    try {
      const recordings = await listRecordings();
      
      return {
        platform: Capacitor.getPlatform(),
        isNative: isNativePlatform,
        recordingCount: recordings.length,
        videosPath: 'Documents/Videos/'
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return null;
    }
  }, [isNativePlatform, listRecordings]);

  return {
    isRecording,
    isProcessing,
    isNativePlatform,
    saveToDeviceStorage,
    createVideoFolder,
    listRecordings,
    getStorageInfo,
    setIsRecording,
    setIsProcessing
  };
};

// Helper function to convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (data:video/webm;base64,)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useDirectoryPicker } from './useDirectoryPicker';
import { getRecordingPath } from '@/utils/folderStructure';

export interface RecordingOptions {
  storageType: 'supabase' | 'local';
  fileType: 'video' | 'image';
  quality?: 'high' | 'medium' | 'low';
  motionDetected?: boolean;
  dateOrganizedFolders?: boolean;
}

export const useRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const { saveFileToDirectory } = useDirectoryPicker();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async (stream: MediaStream, options: RecordingOptions) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to start recording",
        variant: "destructive"
      });
      return;
    }

    try {
      recordedChunksRef.current = [];
      
      // Try different codecs in order of preference, with fallbacks for browser compatibility
      let mediaRecorderOptions: MediaRecorderOptions | undefined;
      const codecOptions = [
        'video/webm;codecs=vp8',  // More widely supported than vp9
        'video/webm',             // Let browser choose codec
        'video/mp4',              // Fallback for Safari/other browsers
        undefined                 // No codec specified, browser default
      ];
      
      for (const codec of codecOptions) {
        try {
          const options = codec ? { mimeType: codec } : undefined;
          if (!codec || MediaRecorder.isTypeSupported(codec)) {
            mediaRecorderOptions = options;
            console.log('Using codec:', codec || 'browser default');
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        await handleRecordingComplete(options);
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start duration counter
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      
      toast({
        title: "Recording started",
        description: `Recording to ${options.storageType === 'supabase' ? 'Supabase' : 'local'} storage`
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording failed",
        description: "Could not start recording",
        variant: "destructive"
      });
    }
  }, [user, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingDuration(0);
    }
  }, [isRecording]);

  const handleImageSave = useCallback(async (blob: Blob, options: RecordingOptions) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot_${timestamp}.jpg`;
    
    if (options.storageType === 'supabase') {
      await saveToSupabase(blob, filename, 'image', options.motionDetected, options.dateOrganizedFolders);
    } else {
      await saveToLocal(blob, filename, 'image', options.motionDetected, options.dateOrganizedFolders);
    }
  }, [user, toast]);

  const takeSnapshot = useCallback(async (
    videoElement: HTMLVideoElement | HTMLImageElement,
    options: RecordingOptions
  ) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to take snapshots",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Wait for image to be loaded if it's an img element
      if (videoElement instanceof HTMLImageElement) {
        if (!videoElement.complete) {
          console.log('Waiting for image to load...');
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Image load timeout')), 5000);
            videoElement.onload = () => {
              clearTimeout(timeout);
              resolve(true);
            };
            videoElement.onerror = () => {
              clearTimeout(timeout);
              reject(new Error('Image failed to load'));
            };
          });
        }
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Get dimensions based on element type
      let width = 0;
      let height = 0;
      
      if (videoElement instanceof HTMLVideoElement) {
        width = videoElement.videoWidth;
        height = videoElement.videoHeight;
      } else {
        width = videoElement.naturalWidth;
        height = videoElement.naturalHeight;
      }

      // Validate dimensions
      if (width === 0 || height === 0) {
        throw new Error(`Invalid image dimensions: ${width}x${height}. The camera stream may not be ready yet.`);
      }

      console.log(`Capturing snapshot at ${width}x${height}`);
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(videoElement, 0, 0);

      // Convert to blob with retry logic
      const captureBlob = (): Promise<Blob | null> => {
        return new Promise((resolve) => {
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
        });
      };

      let blob = await captureBlob();
      
      // Retry once if first attempt fails
      if (!blob) {
        console.warn('First snapshot attempt returned null, retrying...');
        await new Promise(resolve => setTimeout(resolve, 100));
        blob = await captureBlob();
      }

      if (!blob) {
        throw new Error('Failed to capture image data. Please try again.');
      }

      console.log(`Snapshot captured successfully, size: ${blob.size} bytes`);
      await handleImageSave(blob, options);

    } catch (error) {
      console.error('Error taking snapshot:', error);
      toast({
        title: "Snapshot failed",
        description: error instanceof Error ? error.message : "Could not capture image",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  }, [user, toast, handleImageSave]);

  const handleRecordingComplete = async (options: RecordingOptions) => {
    if (recordedChunksRef.current.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      await handleVideoSave(blob, options);
    } catch (error) {
      console.error('Error processing recording:', error);
      toast({
        title: "Processing failed",
        description: "Could not save recording",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVideoSave = async (blob: Blob, options: RecordingOptions) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording_${timestamp}.webm`;
    
    if (options.storageType === 'supabase') {
      await saveToSupabase(blob, filename, 'video', options.motionDetected, options.dateOrganizedFolders);
    } else {
      await saveToLocal(blob, filename, 'video', options.motionDetected, options.dateOrganizedFolders);
    }
  };

  const saveToSupabase = async (blob: Blob, filename: string, fileType: 'video' | 'image', motionDetected?: boolean, dateOrganizedFolders?: boolean) => {
    try {
      // Get organized path
      const dateOrganized = dateOrganizedFolders ?? true;
      const folderPath = getRecordingPath({
        basePath: user!.id,
        dateOrganized,
        motionDetected
      });

      const filePath = `${folderPath}/${filename}`;
      console.log('Uploading to Supabase Storage:', { path: filePath, size: blob.size });

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(filePath, blob, {
          contentType: fileType === 'video' ? 'video/webm' : 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Supabase Storage error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful, saving metadata to database');

      // Save metadata to database
      const { error: dbError } = await supabase
        .from('recordings')
        .insert({
          user_id: user!.id,
          filename,
          file_type: fileType,
          storage_type: 'supabase',
          file_path: uploadData.path,
          file_size: blob.size,
          motion_detected: motionDetected || false
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw dbError;
      }

      toast({
        title: "Saved to Supabase",
        description: `${fileType} saved securely to cloud storage`
      });
    } catch (error) {
      console.error('Error saving to Supabase:', error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save to storage",
        variant: "destructive"
      });
      throw error;
    }
  };

  const saveToLocal = async (blob: Blob, filename: string, fileType: 'video' | 'image', motionDetected?: boolean, dateOrganizedFolders?: boolean) => {
    try {
      // Get organized path for local storage
      const dateOrganized = dateOrganizedFolders ?? true; // Default to true
      const folderPath = getRecordingPath({
        basePath: 'downloads',
        dateOrganized,
        motionDetected
      });
      
      // Try to save to selected directory first (if available)
      const savedToDirectory = await saveFileToDirectory(blob, filename);
      
      if (!savedToDirectory) {
        // Fall back to regular download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
      const { error } = await supabase
        .from('recordings')
        .insert({
          user_id: user!.id,
          filename,
          file_type: fileType,
          storage_type: 'local',
          file_path: `/${folderPath}/${filename}`,
          file_size: blob.size,
          motion_detected: motionDetected || false
        });
      
      if (error) throw error;
      
      toast({
        title: "Saved locally",
        description: `${fileType} downloaded and metadata saved`
      });
    } catch (error) {
      console.error('Error saving locally:', error);
      throw error;
    }
  };

  return {
    isRecording,
    isProcessing,
    recordingDuration,
    startRecording,
    stopRecording,
    takeSnapshot
  };
};


import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface RecordingOptions {
  storageType: 'cloud' | 'local';
  fileType: 'video' | 'image';
  quality?: 'high' | 'medium' | 'low';
}

export const useRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

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
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
      });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        await handleRecordingComplete(options);
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      
      toast({
        title: "Recording started",
        description: `Recording to ${options.storageType} storage`
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
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const takeSnapshot = useCallback(async (videoElement: HTMLVideoElement, options: RecordingOptions) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to take snapshots",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsProcessing(true);
      
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      
      ctx.drawImage(videoElement, 0, 0);
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          await handleImageSave(blob, { ...options, fileType: 'image' });
        }
      }, 'image/jpeg', 0.9);
      
    } catch (error) {
      console.error('Error taking snapshot:', error);
      toast({
        title: "Snapshot failed",
        description: "Could not capture image",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  }, [user, toast]);

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
    const filename = `recording_${Date.now()}.webm`;
    
    if (options.storageType === 'cloud') {
      await saveToCloud(blob, filename, 'video');
    } else {
      await saveToLocal(blob, filename, 'video');
    }
  };

  const handleImageSave = async (blob: Blob, options: RecordingOptions) => {
    const filename = `snapshot_${Date.now()}.jpg`;
    
    if (options.storageType === 'cloud') {
      await saveToCloud(blob, filename, 'image');
    } else {
      await saveToLocal(blob, filename, 'image');
    }
  };

  const saveToCloud = async (blob: Blob, filename: string, fileType: 'video' | 'image') => {
    try {
      const filePath = `${user!.id}/${filename}`;
      
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(filePath, blob);
      
      if (uploadError) throw uploadError;
      
      const { error: dbError } = await supabase
        .from('recordings')
        .insert({
          user_id: user!.id,
          filename,
          file_type: fileType,
          storage_type: 'cloud',
          file_path: filePath,
          file_size: blob.size
        });
      
      if (dbError) throw dbError;
      
      toast({
        title: "Saved to cloud",
        description: `${fileType} saved successfully`
      });
    } catch (error) {
      console.error('Error saving to cloud:', error);
      throw error;
    }
  };

  const saveToLocal = async (blob: Blob, filename: string, fileType: 'video' | 'image') => {
    try {
      // For local storage, we'll download the file and save metadata
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Save metadata to database
      const { error } = await supabase
        .from('recordings')
        .insert({
          user_id: user!.id,
          filename,
          file_type: fileType,
          storage_type: 'local',
          file_path: `/sdcard/recordings/${filename}`, // Raspberry Pi SD card path
          file_size: blob.size
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
    startRecording,
    stopRecording,
    takeSnapshot
  };
};

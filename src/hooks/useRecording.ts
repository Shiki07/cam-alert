
import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface RecordingOptions {
  storageType: 'cloud' | 'local';
  fileType: 'video' | 'image';
  quality?: 'high' | 'medium' | 'low';
  motionDetected?: boolean;
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `recording_${timestamp}.webm`;
    
    if (options.storageType === 'cloud') {
      await saveToCloud(blob, filename, 'video', options.motionDetected);
    } else {
      await saveToLocal(blob, filename, 'video', options.motionDetected);
    }
  };

  const handleImageSave = async (blob: Blob, options: RecordingOptions) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot_${timestamp}.jpg`;
    
    if (options.storageType === 'cloud') {
      await saveToCloud(blob, filename, 'image', options.motionDetected);
    } else {
      await saveToLocal(blob, filename, 'image', options.motionDetected);
    }
  };

  const saveToCloud = async (blob: Blob, filename: string, fileType: 'video' | 'image', motionDetected?: boolean) => {
    try {
      const filePath = `${user!.id}/${filename}`;
      
      console.log('Uploading to cloud:', { filePath, size: blob.size, type: blob.type });
      
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(filePath, blob, {
          contentType: fileType === 'video' ? 'video/webm' : 'image/jpeg',
          upsert: false
        });
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }
      
      console.log('Upload successful, saving metadata to database');
      
      const { data: recording, error: dbError } = await supabase
        .from('recordings')
        .insert({
          user_id: user!.id,
          filename,
          file_type: fileType,
          storage_type: 'cloud',
          file_path: filePath,
          file_size: blob.size,
          motion_detected: motionDetected || false,
          pi_sync_status: 'pending'
        })
        .select()
        .single();
      
      if (dbError) {
        console.error('Database error:', dbError);
        throw dbError;
      }
      
      // Trigger Pi sync if enabled
      try {
        const piEndpoint = localStorage.getItem('piEndpoint');
        if (piEndpoint && recording) {
          console.log('Triggering Pi sync for recording:', recording.id);
          
          // Call Pi sync function in background
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            supabase.functions.invoke('pi-sync', {
              body: {
                recording_id: recording.id,
                pi_endpoint: piEndpoint
              },
              headers: {
                Authorization: `Bearer ${session.access_token}`
              }
            }).then(({ data, error }) => {
              if (error) {
                console.error('Pi sync failed:', error);
              } else {
                console.log('Pi sync initiated successfully');
              }
            });
          }
        }
      } catch (piError) {
        // Don't fail the main save if Pi sync fails
        console.warn('Pi sync error (non-critical):', piError);
      }
      
      toast({
        title: "Saved to cloud",
        description: `${fileType} saved successfully to Supabase Storage${localStorage.getItem('piEndpoint') ? ' and queued for Pi sync' : ''}`
      });
    } catch (error) {
      console.error('Error saving to cloud:', error);
      toast({
        title: "Cloud save failed",
        description: error instanceof Error ? error.message : "Could not save to cloud storage",
        variant: "destructive"
      });
      throw error;
    }
  };

  const saveToLocal = async (blob: Blob, filename: string, fileType: 'video' | 'image', motionDetected?: boolean) => {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      const { error } = await supabase
        .from('recordings')
        .insert({
          user_id: user!.id,
          filename,
          file_type: fileType,
          storage_type: 'local',
          file_path: `/downloads/${filename}`,
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
    startRecording,
    stopRecording,
    takeSnapshot
  };
};

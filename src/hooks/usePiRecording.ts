import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface PiRecordingOptions {
  piUrl: string;
  streamUrl: string;
  quality: 'high' | 'medium' | 'low';
  motionTriggered?: boolean;
}

export const usePiRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async (options: PiRecordingOptions) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to start recording",
        variant: "destructive"
      });
      return;
    }

    if (isRecording) {
      toast({
        title: "Already recording",
        description: "Stop the current recording first",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Generate unique recording ID
      const recordingId = `pi_rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('Starting Pi recording:', { recordingId, ...options });

      // Call edge function to start recording on Pi
      const { data, error } = await supabase.functions.invoke('pi-recording', {
        body: {
          action: 'start',
          pi_url: options.piUrl,
          recording_id: recordingId,
          stream_url: options.streamUrl,
          quality: options.quality,
          motion_triggered: options.motionTriggered || false
        }
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to start recording');
      }

      console.log('Pi recording started:', data);

      setIsRecording(true);
      setCurrentRecordingId(recordingId);
      setRecordingDuration(0);

      // Start duration counter
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      toast({
        title: "Recording started",
        description: `Recording on Raspberry Pi to ${data.filename}`
      });

      return recordingId;

    } catch (error) {
      console.error('Error starting Pi recording:', error);
      toast({
        title: "Recording failed",
        description: error instanceof Error ? error.message : "Could not start recording on Pi",
        variant: "destructive"
      });
      setIsRecording(false);
      setCurrentRecordingId(null);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [user, isRecording, toast]);

  const stopRecording = useCallback(async (piUrl: string) => {
    if (!currentRecordingId) {
      toast({
        title: "No recording",
        description: "No active recording to stop",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    // Clear duration interval
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    try {
      console.log('Stopping Pi recording:', currentRecordingId);

      // Call edge function to stop recording on Pi
      const { data, error } = await supabase.functions.invoke('pi-recording', {
        body: {
          action: 'stop',
          pi_url: piUrl,
          recording_id: currentRecordingId
        }
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to stop recording');
      }

      console.log('Pi recording stopped:', data);

      toast({
        title: "Recording saved",
        description: `Saved ${data.filename} (${Math.round(data.file_size / 1024 / 1024)}MB, ${data.duration_seconds}s)`
      });

      setIsRecording(false);
      setCurrentRecordingId(null);
      setRecordingDuration(0);

      return data;

    } catch (error) {
      console.error('Error stopping Pi recording:', error);
      toast({
        title: "Stop recording failed",
        description: error instanceof Error ? error.message : "Could not stop recording on Pi",
        variant: "destructive"
      });
      // Still reset state even if stop fails
      setIsRecording(false);
      setCurrentRecordingId(null);
      setRecordingDuration(0);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [currentRecordingId, toast]);

  const getStatus = useCallback(async (piUrl: string, recordingId?: string) => {
    const id = recordingId || currentRecordingId;
    if (!id) return null;

    try {
      const { data, error } = await supabase.functions.invoke('pi-recording', {
        body: {
          action: 'status',
          pi_url: piUrl,
          recording_id: id
        }
      });

      if (error) throw error;
      return data;

    } catch (error) {
      console.error('Error getting Pi recording status:', error);
      return null;
    }
  }, [currentRecordingId]);

  const testConnection = useCallback(async (piUrl: string) => {
    try {
      // Extract base URL without path
      const url = new URL(piUrl);
      const baseUrl = `${url.protocol}//${url.hostname}`;
      const port = url.port || '3002';
      const healthUrl = `${baseUrl}:${port}/health`;

      console.log('Testing Pi recording service connection:', healthUrl);

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`Service returned ${response.status}`);
      }

      const data = await response.json();
      console.log('Pi recording service health check:', data);

      return {
        connected: true,
        service: data
      };
    } catch (error) {
      console.error('Pi recording service connection test failed:', error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }, []);

  return {
    isRecording,
    isProcessing,
    currentRecordingId,
    recordingDuration,
    startRecording,
    stopRecording,
    getStatus,
    testConnection
  };
};
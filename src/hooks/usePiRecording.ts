import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface PiRecordingOptions {
  piUrl: string;
  streamUrl: string;
  quality: 'high' | 'medium' | 'low';
  motionTriggered?: boolean;
  videoPath?: string;
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
      // Generate proper UUID for database
      const recordingId = crypto.randomUUID();
      
      console.log('Starting Pi recording:', { recordingId, ...options });

      // Check if Pi URL is local (same network)
      const isLocalNetwork = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(options.piUrl);

      let result;
      
      if (isLocalNetwork) {
        // Direct call to Pi service (local network, no port forwarding needed)
        console.log('Using direct Pi service call (local network)');
        const response = await fetch(`${options.piUrl}/recording/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recording_id: recordingId,
            stream_url: options.streamUrl,
            quality: options.quality,
            motion_triggered: options.motionTriggered || false,
            video_path: options.videoPath
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Pi service error: ${errorText}`);
        }

        result = await response.json();

        // Save to Supabase manually when using direct call
        const { error: dbError } = await supabase
          .from('recordings')
          .insert({
            id: recordingId,
            user_id: user.id,
            filename: result.filename,
            file_type: 'video',
            storage_type: 'local',
            file_path: `/pi/${result.filename}`,
            motion_detected: options.motionTriggered || false,
            pi_sync_status: 'recording'
          });

        if (dbError) {
          console.warn('Failed to save recording metadata:', dbError);
        }
      } else {
        // Use edge function (external access, requires port forwarding)
        console.log('Using edge function (external access, requires port 3002 forwarding)');
        const { data, error } = await supabase.functions.invoke('pi-recording', {
          body: {
            action: 'start',
            pi_url: options.piUrl,
            recording_id: recordingId,
            stream_url: options.streamUrl,
            quality: options.quality,
            motion_triggered: options.motionTriggered || false,
            video_path: options.videoPath
          }
        });

        if (error) throw error;
        if (!data?.success) {
          throw new Error(data?.error || 'Failed to start recording');
        }
        result = data;
      }

      console.log('Pi recording started:', result);

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
        description: `Recording on Raspberry Pi to ${result.filename}`
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
  }, [user, isRecording, toast, supabase]);

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

    // Show immediate feedback
    toast({
      title: "Stopping recording...",
      description: "Please wait while we stop the recording"
    });

    // Clear duration interval
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    try {
      console.log('Stopping Pi recording:', currentRecordingId);

      // Check if Pi URL is local (same network)
      const isLocalNetwork = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(piUrl);

      let result;

      if (isLocalNetwork) {
        // Direct call to Pi service (local network) with timeout
        console.log('Using direct Pi service call (local network)');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          const response = await fetch(`${piUrl}/recording/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recording_id: currentRecordingId }),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Pi service error: ${errorText}`);
          }

          result = await response.json();
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error('Stop operation timed out - recording may still be active on Pi');
          }
          throw fetchError;
        }

        // Update Supabase manually when using direct call
        if (user) {
          const { error: dbError } = await supabase
            .from('recordings')
            .update({
              file_size: result.file_size,
              duration_seconds: result.duration_seconds,
              pi_sync_status: 'completed',
              pi_synced_at: new Date().toISOString()
            })
            .eq('id', currentRecordingId)
            .eq('user_id', user.id);

          if (dbError) {
            console.warn('Failed to update recording metadata:', dbError);
          }
        }
      } else {
        // Use edge function (external access)
        console.log('Using edge function (external access)');
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
        result = data;
      }

      console.log('Pi recording stopped:', result);

      toast({
        title: "Recording saved",
        description: `Saved ${result.filename} (${Math.round(result.file_size / 1024 / 1024)}MB, ${result.duration_seconds}s)`
      });

      setIsRecording(false);
      setCurrentRecordingId(null);
      setRecordingDuration(0);

      return result;

    } catch (error) {
      console.error('Error stopping Pi recording:', error);
      
      const errorMessage = error instanceof Error ? error.message : "Could not stop recording on Pi";
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
      
      toast({
        title: isTimeout ? "Stop operation timed out" : "Stop recording failed",
        description: isTimeout 
          ? "The Pi is taking longer than expected. Check your Pi to verify recording status."
          : errorMessage,
        variant: "destructive"
      });
      
      // Reset state even if stop fails to allow user to try again
      setIsRecording(false);
      setCurrentRecordingId(null);
      setRecordingDuration(0);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [currentRecordingId, user, toast]);

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

  // Cache for successful connection tests (60 seconds)
  const connectionCache = useRef<{
    url: string;
    result: { connected: boolean; service?: any };
    timestamp: number;
  } | null>(null);

  const testConnection = useCallback(async (piUrl: string, localIp?: string) => {
    try {
      // Use edge function to test connection (bypasses HTTPS mixed content blocking)
      const testUrl = localIp ? `http://${localIp}:3002` : piUrl;
      
      // Check cache for successful results (60 second TTL)
      const now = Date.now();
      if (connectionCache.current && 
          connectionCache.current.url === testUrl && 
          connectionCache.current.result.connected &&
          (now - connectionCache.current.timestamp) < 60000) {
        console.log('Using cached Pi service connection result (valid for', Math.floor((60000 - (now - connectionCache.current.timestamp)) / 1000), 'more seconds)');
        return connectionCache.current.result;
      }

      console.log('Testing Pi recording service via edge function:', testUrl);

      const { data, error } = await supabase.functions.invoke('test-pi-connection', {
        body: { pi_endpoint: testUrl }
      });

      if (error) {
        console.error('Edge function error:', error);
        return { connected: false, error: error.message };
      }

      // Edge function returns success/reachable, not connected
      if (!data?.success) {
        return { 
          connected: false, 
          error: data?.error || 'Pi service not reachable'
        };
      }

      console.log('✓ Pi recording service accessible:', testUrl);
      const result = { connected: true, service: data.healthData };
      
      // Cache successful result
      connectionCache.current = {
        url: testUrl,
        result,
        timestamp: now
      };
      
      return result;

    } catch (error) {
      console.error('Pi recording service connection test failed:', error);
      return { 
        connected: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
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
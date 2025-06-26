
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MotionNotificationOptions {
  email: string;
  enabled: boolean;
  includeAttachment?: boolean;
}

export const useMotionNotification = (options: MotionNotificationOptions) => {
  const { toast } = useToast();

  const captureFrameAsBase64 = useCallback((videoElement: HTMLVideoElement): string => {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    ctx.drawImage(videoElement, 0, 0);
    
    // Get base64 data without the data URL prefix
    const dataURL = canvas.toDataURL('image/jpeg', 0.8);
    return dataURL.split(',')[1];
  }, []);

  const sendMotionAlert = useCallback(async (
    videoElement?: HTMLVideoElement,
    motionLevel?: number
  ) => {
    if (!options.enabled || !options.email) {
      console.log('Motion notifications disabled or no email provided');
      return;
    }

    try {
      let attachmentData: string | undefined;
      let attachmentType: 'image' | 'video' | undefined;

      // Capture frame if video element is provided and attachments are enabled
      if (videoElement && options.includeAttachment) {
        attachmentData = captureFrameAsBase64(videoElement);
        attachmentType = 'image';
      }

      const { data, error } = await supabase.functions.invoke('send-motion-alert', {
        body: {
          email: options.email,
          attachmentData,
          attachmentType,
          timestamp: new Date().toISOString(),
          motionLevel
        }
      });

      if (error) {
        console.error('Error sending motion alert:', error);
        toast({
          title: "Email notification failed",
          description: "Could not send motion detection email",
          variant: "destructive"
        });
        return;
      }

      console.log('Motion alert sent successfully');
      toast({
        title: "Motion alert sent",
        description: `Email notification sent to ${options.email}`,
      });

    } catch (error) {
      console.error('Error in sendMotionAlert:', error);
      toast({
        title: "Email notification failed",
        description: "Could not send motion detection email",
        variant: "destructive"
      });
    }
  }, [options, captureFrameAsBase64, toast]);

  return {
    sendMotionAlert
  };
};

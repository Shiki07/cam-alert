
import { useRef, useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface EnhancedMotionDetectionConfig {
  sensitivity: number;
  threshold: number;
  enabled: boolean;
  scheduleEnabled: boolean;
  startHour: number;
  endHour: number;
  detectionZonesEnabled: boolean;
  cooldownPeriod: number;
  minMotionDuration: number;
  noiseReduction: boolean;
  // Performance settings
  detectionInterval?: number; // ms between frame checks (default: 500)
  frameScale?: number; // downsampling factor 0.125-1.0 (default: 0.25)
  skipPixels?: number; // analyze every Nth pixel (default: 4)
  onMotionDetected?: (motionLevel: number) => void;
  onMotionCleared?: () => void;
}

export const useEnhancedMotionDetection = (config: EnhancedMotionDetectionConfig) => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [lastMotionTime, setLastMotionTime] = useState<Date | null>(null);
  const [currentMotionLevel, setCurrentMotionLevel] = useState(0);
  const [motionEventsToday, setMotionEventsToday] = useState(0);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [lastAlertTime, setLastAlertTime] = useState<Date | null>(null);
  
  const previousFrameRef = useRef<ImageData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const motionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const motionStartTimeRef = useRef<Date | null>(null);
  const scaledDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();

  // Performance defaults
  const detectionInterval = config.detectionInterval ?? 500;
  const frameScale = config.frameScale ?? 0.25;
  const skipPixels = config.skipPixels ?? 4;

  const isWithinSchedule = useCallback(() => {
    if (!config.scheduleEnabled) return true;
    
    const now = new Date();
    const currentHour = now.getHours();
    
    if (config.startHour <= config.endHour) {
      return currentHour >= config.startHour && currentHour < config.endHour;
    } else {
      return currentHour >= config.startHour || currentHour < config.endHour;
    }
  }, [config.scheduleEnabled, config.startHour, config.endHour]);

  const initializeCanvas = useCallback((video: HTMLVideoElement) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      contextRef.current = canvasRef.current.getContext('2d', { willReadFrequently: true });
    }
    
    const canvas = canvasRef.current;
    const context = contextRef.current;
    
    if (canvas && context) {
      // Downsample: use scaled dimensions for significant CPU savings
      const scaledWidth = Math.floor(video.videoWidth * frameScale);
      const scaledHeight = Math.floor(video.videoHeight * frameScale);
      
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      scaledDimensionsRef.current = { width: scaledWidth, height: scaledHeight };
      
      return { canvas, context };
    }
    
    return null;
  }, [frameScale]);

  const isInCooldownPeriod = useCallback(() => {
    if (!lastAlertTime) return false;
    const now = new Date();
    const timeSinceLastAlert = (now.getTime() - lastAlertTime.getTime()) / 1000;
    return timeSinceLastAlert < config.cooldownPeriod;
  }, [lastAlertTime, config.cooldownPeriod]);

  const calculateMotion = useCallback((currentFrame: ImageData, previousFrame: ImageData): number => {
    const current = currentFrame.data;
    const previous = previousFrame.data;
    let changedPixels = 0;
    let sampledPixels = 0;
    
    const noiseThreshold = config.noiseReduction ? 15 : 5;
    
    // Skip-pixel analysis: only check every Nth pixel for massive performance gain
    const pixelStep = skipPixels * 4; // 4 channels per pixel (RGBA)
    
    for (let i = 0; i < current.length; i += pixelStep) {
      sampledPixels++;
      const currentGray = (current[i] + current[i + 1] + current[i + 2]) / 3;
      const previousGray = (previous[i] + previous[i + 1] + previous[i + 2]) / 3;
      
      const difference = Math.abs(currentGray - previousGray);
      const sensitivityThreshold = Math.max(noiseThreshold, 255 - (config.sensitivity * 2.55));
      
      if (difference > sensitivityThreshold) {
        changedPixels++;
      }
    }
    
    // Return percentage based on sampled pixels, not total
    return sampledPixels > 0 ? (changedPixels / sampledPixels) * 100 : 0;
  }, [config.sensitivity, config.noiseReduction, skipPixels]);

  const saveMotionEvent = useCallback(async (motionLevel: number, detected: boolean) => {
    if (!user) return;

    try {
      if (detected && !currentEventId) {
        const { data, error } = await supabase
          .from('motion_events')
          .insert({
            user_id: user.id,
            motion_level: motionLevel,
            detected_at: new Date().toISOString(),
            recording_triggered: true
          })
          .select()
          .single();

        if (error) {
          console.error('Error saving motion event:', error);
          return;
        }

        setCurrentEventId(data.id);
      } else if (!detected && currentEventId) {
        await supabase.rpc('update_motion_event_cleared', {
          event_id: currentEventId
        });
        setCurrentEventId(null);
      }
    } catch (error) {
      console.error('Error in motion event logging:', error);
    }
  }, [user, currentEventId]);

  const processFrame = useCallback((video: HTMLVideoElement) => {
    if (!config.enabled || !video.videoWidth || !video.videoHeight) return;
    
    if (!isWithinSchedule()) return;
    if (isInCooldownPeriod()) return;
    
    const canvasData = initializeCanvas(video);
    if (!canvasData) return;
    
    const { canvas, context } = canvasData;
    
    // Draw scaled frame (downsampled for performance)
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    if (previousFrameRef.current) {
      const motionLevel = calculateMotion(currentFrame, previousFrameRef.current);
      
      setCurrentMotionLevel(motionLevel);
      
      if (motionLevel > config.threshold) {
        if (!motionDetected) {
          if (!motionStartTimeRef.current) {
            motionStartTimeRef.current = new Date();
          }
          
          const motionDuration = new Date().getTime() - motionStartTimeRef.current.getTime();
          if (motionDuration >= config.minMotionDuration) {
            console.log('Motion detected!', motionLevel.toFixed(2) + '%');
            setMotionDetected(true);
            setLastMotionTime(new Date());
            setLastAlertTime(new Date());
            setMotionEventsToday(prev => prev + 1);
            
            saveMotionEvent(motionLevel, true);
            config.onMotionDetected?.(motionLevel);
            
            toast({
              title: "Motion Detected!",
              description: `Movement detected (${motionLevel.toFixed(1)}% change)`,
              variant: "default"
            });
          }
        }
        
        if (motionTimeoutRef.current) {
          clearTimeout(motionTimeoutRef.current);
        }
        
        motionTimeoutRef.current = setTimeout(() => {
          console.log('Motion cleared');
          setMotionDetected(false);
          setCurrentMotionLevel(0);
          motionStartTimeRef.current = null;
          saveMotionEvent(0, false);
          config.onMotionCleared?.();
        }, 3000);
      } else {
        motionStartTimeRef.current = null;
      }
    }
    
    previousFrameRef.current = currentFrame;
  }, [config, motionDetected, isWithinSchedule, isInCooldownPeriod, initializeCanvas, calculateMotion, saveMotionEvent, toast]);

  const startDetection = useCallback((video: HTMLVideoElement) => {
    if (!config.enabled || isDetecting) return;
    
    console.log(`Starting motion detection (interval: ${detectionInterval}ms, scale: ${frameScale}, skipPixels: ${skipPixels})`);
    setIsDetecting(true);
    
    detectionIntervalRef.current = setInterval(() => {
      processFrame(video);
    }, detectionInterval);
  }, [config.enabled, isDetecting, processFrame, detectionInterval, frameScale, skipPixels]);

  const stopDetection = useCallback(() => {
    console.log('Stopping enhanced motion detection');
    setIsDetecting(false);
    setMotionDetected(false);
    setCurrentMotionLevel(0);
    
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    
    if (motionTimeoutRef.current) {
      clearTimeout(motionTimeoutRef.current);
      motionTimeoutRef.current = null;
    }
    
    previousFrameRef.current = null;
    scaledDimensionsRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);

  // Reset daily counter at midnight
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    const timeout = setTimeout(() => {
      setMotionEventsToday(0);
      
      const dailyInterval = setInterval(() => {
        setMotionEventsToday(0);
      }, 24 * 60 * 60 * 1000);
      
      return () => clearInterval(dailyInterval);
    }, msUntilMidnight);
    
    return () => clearTimeout(timeout);
  }, []);

  return {
    isDetecting,
    motionDetected,
    lastMotionTime,
    currentMotionLevel,
    motionEventsToday,
    startDetection,
    stopDetection,
    isWithinSchedule: isWithinSchedule()
  };
};

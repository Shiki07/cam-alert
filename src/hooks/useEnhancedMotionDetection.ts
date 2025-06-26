
import { useRef, useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface EnhancedMotionDetectionConfig {
  sensitivity: number;
  threshold: number;
  enabled: boolean;
  scheduleEnabled: boolean;
  startHour: number;
  endHour: number;
  onMotionDetected?: (motionLevel: number) => void;
  onMotionCleared?: () => void;
}

export const useEnhancedMotionDetection = (config: EnhancedMotionDetectionConfig) => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [lastMotionTime, setLastMotionTime] = useState<Date | null>(null);
  const [currentMotionLevel, setCurrentMotionLevel] = useState(0);
  const [motionEventsToday, setMotionEventsToday] = useState(0);
  
  const previousFrameRef = useRef<ImageData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const motionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();

  const isWithinSchedule = useCallback(() => {
    if (!config.scheduleEnabled) return true;
    
    const now = new Date();
    const currentHour = now.getHours();
    
    if (config.startHour <= config.endHour) {
      return currentHour >= config.startHour && currentHour < config.endHour;
    } else {
      // Handle overnight schedule (e.g., 22:00 to 06:00)
      return currentHour >= config.startHour || currentHour < config.endHour;
    }
  }, [config.scheduleEnabled, config.startHour, config.endHour]);

  const initializeCanvas = useCallback((video: HTMLVideoElement) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      contextRef.current = canvasRef.current.getContext('2d');
    }
    
    const canvas = canvasRef.current;
    const context = contextRef.current;
    
    if (canvas && context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      return { canvas, context };
    }
    
    return null;
  }, []);

  const calculateMotion = useCallback((currentFrame: ImageData, previousFrame: ImageData): number => {
    const current = currentFrame.data;
    const previous = previousFrame.data;
    let changedPixels = 0;
    
    for (let i = 0; i < current.length; i += 4) {
      const currentGray = (current[i] + current[i + 1] + current[i + 2]) / 3;
      const previousGray = (previous[i] + previous[i + 1] + previous[i + 2]) / 3;
      
      const difference = Math.abs(currentGray - previousGray);
      const sensitivityThreshold = 255 - (config.sensitivity * 2.55);
      
      if (difference > sensitivityThreshold) {
        changedPixels++;
      }
    }
    
    return changedPixels;
  }, [config.sensitivity]);

  const processFrame = useCallback((video: HTMLVideoElement) => {
    if (!config.enabled || !video.videoWidth || !video.videoHeight) return;
    
    // Check schedule
    if (!isWithinSchedule()) {
      return;
    }
    
    const canvasData = initializeCanvas(video);
    if (!canvasData) return;
    
    const { canvas, context } = canvasData;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    if (previousFrameRef.current) {
      const changedPixels = calculateMotion(currentFrame, previousFrameRef.current);
      const motionLevel = (changedPixels / (canvas.width * canvas.height)) * 100;
      
      setCurrentMotionLevel(motionLevel);
      
      if (motionLevel > config.threshold) {
        if (!motionDetected) {
          console.log('Motion detected!', motionLevel.toFixed(2) + '%');
          setMotionDetected(true);
          setLastMotionTime(new Date());
          setMotionEventsToday(prev => prev + 1);
          config.onMotionDetected?.(motionLevel);
          
          toast({
            title: "Motion Detected!",
            description: `Movement detected (${motionLevel.toFixed(1)}% change)`,
            variant: "default"
          });
        }
        
        if (motionTimeoutRef.current) {
          clearTimeout(motionTimeoutRef.current);
        }
        
        motionTimeoutRef.current = setTimeout(() => {
          console.log('Motion cleared');
          setMotionDetected(false);
          setCurrentMotionLevel(0);
          config.onMotionCleared?.();
        }, 3000);
      }
    }
    
    previousFrameRef.current = currentFrame;
  }, [config, motionDetected, isWithinSchedule, initializeCanvas, calculateMotion, toast]);

  const startDetection = useCallback((video: HTMLVideoElement) => {
    if (!config.enabled || isDetecting) return;
    
    console.log('Starting enhanced motion detection');
    setIsDetecting(true);
    
    detectionIntervalRef.current = setInterval(() => {
      processFrame(video);
    }, 200);
  }, [config.enabled, isDetecting, processFrame]);

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
      
      // Set up daily interval
      const dailyInterval = setInterval(() => {
        setMotionEventsToday(0);
      }, 24 * 60 * 60 * 1000); // 24 hours
      
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

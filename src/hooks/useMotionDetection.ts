
import { useRef, useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface MotionDetectionConfig {
  sensitivity: number; // 0-100
  threshold: number; // minimum pixels changed to trigger motion
  enabled: boolean;
  onMotionDetected?: (motionLevel: number) => void;
  onMotionCleared?: () => void;
}

export const useMotionDetection = (config: MotionDetectionConfig) => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [lastMotionTime, setLastMotionTime] = useState<Date | null>(null);
  const [currentMotionLevel, setCurrentMotionLevel] = useState(0);
  
  const previousFrameRef = useRef<ImageData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const motionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();

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
    
    // Compare frames pixel by pixel
    for (let i = 0; i < current.length; i += 4) {
      const currentGray = (current[i] + current[i + 1] + current[i + 2]) / 3;
      const previousGray = (previous[i] + previous[i + 1] + previous[i + 2]) / 3;
      
      const difference = Math.abs(currentGray - previousGray);
      
      // Adjust sensitivity (higher sensitivity = lower threshold for change)
      const sensitivityThreshold = 255 - (config.sensitivity * 2.55);
      
      if (difference > sensitivityThreshold) {
        changedPixels++;
      }
    }
    
    return changedPixels;
  }, [config.sensitivity]);

  const processFrame = useCallback((video: HTMLVideoElement) => {
    if (!config.enabled || !video.videoWidth || !video.videoHeight) return;
    
    const canvasData = initializeCanvas(video);
    if (!canvasData) return;
    
    const { canvas, context } = canvasData;
    
    // Draw current frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    if (previousFrameRef.current) {
      const changedPixels = calculateMotion(currentFrame, previousFrameRef.current);
      const motionLevel = (changedPixels / (canvas.width * canvas.height)) * 100;
      
      setCurrentMotionLevel(motionLevel);
      
      console.log('Motion level:', motionLevel.toFixed(2) + '%', 'Threshold:', config.threshold);
      
      if (motionLevel > config.threshold) {
        if (!motionDetected) {
          console.log('Motion detected!');
          setMotionDetected(true);
          setLastMotionTime(new Date());
          config.onMotionDetected?.(motionLevel);
          
          toast({
            title: "Motion Detected!",
            description: "Movement detected in camera view",
            variant: "default"
          });
        }
        
        // Reset motion timeout
        if (motionTimeoutRef.current) {
          clearTimeout(motionTimeoutRef.current);
        }
        
        // Clear motion after 3 seconds of no movement
        motionTimeoutRef.current = setTimeout(() => {
          console.log('Motion cleared');
          setMotionDetected(false);
          setCurrentMotionLevel(0);
          config.onMotionCleared?.();
        }, 3000);
      }
    }
    
    previousFrameRef.current = currentFrame;
  }, [config, motionDetected, initializeCanvas, calculateMotion, toast]);

  const startDetection = useCallback((video: HTMLVideoElement) => {
    if (!config.enabled || isDetecting) return;
    
    console.log('Starting motion detection');
    setIsDetecting(true);
    
    // Process frames every 200ms (5 FPS for motion detection)
    detectionIntervalRef.current = setInterval(() => {
      processFrame(video);
    }, 200);
  }, [config.enabled, isDetecting, processFrame]);

  const stopDetection = useCallback(() => {
    console.log('Stopping motion detection');
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);

  return {
    isDetecting,
    motionDetected,
    lastMotionTime,
    currentMotionLevel,
    startDetection,
    stopDetection
  };
};

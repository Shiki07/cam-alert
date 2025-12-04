
import { useRef, useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface MotionDetectionConfig {
  sensitivity: number; // 0-100
  threshold: number; // minimum percentage to trigger motion
  enabled: boolean;
  // Performance settings
  detectionInterval?: number; // ms between frame checks (default: 500)
  frameScale?: number; // downsampling factor 0.125-1.0 (default: 0.25)
  skipPixels?: number; // analyze every Nth pixel (default: 4)
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

  // Performance defaults
  const detectionInterval = config.detectionInterval ?? 500;
  const frameScale = config.frameScale ?? 0.25;
  const skipPixels = config.skipPixels ?? 4;

  const initializeCanvas = useCallback((video: HTMLVideoElement) => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      contextRef.current = canvasRef.current.getContext('2d', { willReadFrequently: true });
    }
    
    const canvas = canvasRef.current;
    const context = contextRef.current;
    
    if (canvas && context) {
      // Downsample for performance
      const scaledWidth = Math.floor(video.videoWidth * frameScale);
      const scaledHeight = Math.floor(video.videoHeight * frameScale);
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      return { canvas, context };
    }
    
    return null;
  }, [frameScale]);

  const calculateMotion = useCallback((currentFrame: ImageData, previousFrame: ImageData): number => {
    const current = currentFrame.data;
    const previous = previousFrame.data;
    let changedPixels = 0;
    let sampledPixels = 0;
    
    // Skip-pixel analysis for performance
    const pixelStep = skipPixels * 4;
    
    for (let i = 0; i < current.length; i += pixelStep) {
      sampledPixels++;
      const currentGray = (current[i] + current[i + 1] + current[i + 2]) / 3;
      const previousGray = (previous[i] + previous[i + 1] + previous[i + 2]) / 3;
      
      const difference = Math.abs(currentGray - previousGray);
      const sensitivityThreshold = 255 - (config.sensitivity * 2.55);
      
      if (difference > sensitivityThreshold) {
        changedPixels++;
      }
    }
    
    return sampledPixels > 0 ? (changedPixels / sampledPixels) * 100 : 0;
  }, [config.sensitivity, skipPixels]);

  const processFrame = useCallback((video: HTMLVideoElement) => {
    if (!config.enabled || !video.videoWidth || !video.videoHeight) return;
    
    const canvasData = initializeCanvas(video);
    if (!canvasData) return;
    
    const { canvas, context } = canvasData;
    
    // Draw scaled frame
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = context.getImageData(0, 0, canvas.width, canvas.height);
    
    if (previousFrameRef.current) {
      const motionLevel = calculateMotion(currentFrame, previousFrameRef.current);
      
      setCurrentMotionLevel(motionLevel);
      
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
  }, [config, motionDetected, initializeCanvas, calculateMotion, toast]);

  const startDetection = useCallback((video: HTMLVideoElement) => {
    if (!config.enabled || isDetecting) return;
    
    console.log(`Starting motion detection (interval: ${detectionInterval}ms, scale: ${frameScale})`);
    setIsDetecting(true);
    
    detectionIntervalRef.current = setInterval(() => {
      processFrame(video);
    }, detectionInterval);
  }, [config.enabled, isDetecting, processFrame, detectionInterval, frameScale]);

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

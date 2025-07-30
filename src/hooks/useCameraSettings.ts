
import { useState, useEffect } from 'react';

export const useCameraSettings = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [motionDetectionEnabled, setMotionDetectionEnabled] = useState(false);
  const [lastMotionTime, setLastMotionTime] = useState<Date | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState('');
  
  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedEmailEnabled = localStorage.getItem('cameraEmailEnabled');
      if (savedEmailEnabled) {
        setEmailEnabled(JSON.parse(savedEmailEnabled));
      }
      
      const savedEmail = localStorage.getItem('cameraNotificationEmail');
      if (savedEmail) {
        setNotificationEmail(savedEmail);
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
    }
  }, []);
  const [storageType, setStorageType] = useState<'cloud' | 'local'>('local');
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('medium');
  
  // Enhanced motion detection settings
  const [motionSensitivity, setMotionSensitivity] = useState(70);
  const [motionThreshold, setMotionThreshold] = useState(0.5);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [startHour, setStartHour] = useState(22);
  const [endHour, setEndHour] = useState(6);
  const [motionEventsToday, setMotionEventsToday] = useState(0);
  
  // New advanced motion detection settings
  const [detectionZonesEnabled, setDetectionZonesEnabled] = useState(false);
  const [cooldownPeriod, setCooldownPeriod] = useState(5);
  const [minMotionDuration, setMinMotionDuration] = useState(500);
  const [noiseReduction, setNoiseReduction] = useState(true);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const handleMotionDetected = (detected: boolean) => {
    setMotionDetected(detected);
    if (detected) {
      setLastMotionTime(new Date());
      setMotionEventsToday(prev => prev + 1);
    }
  };

  const toggleMotionDetection = () => {
    setMotionDetectionEnabled(!motionDetectionEnabled);
    if (!motionDetectionEnabled) {
      setMotionDetected(false);
    }
  };

  const toggleEmailNotifications = () => {
    const newValue = !emailEnabled;
    setEmailEnabled(newValue);
    // Save email enabled state to localStorage
    try {
      localStorage.setItem('cameraEmailEnabled', JSON.stringify(newValue));
    } catch (error) {
      console.error('Failed to save email enabled state to localStorage:', error);
    }
  };

  const handleEmailChange = (email: string) => {
    setNotificationEmail(email);
    // Save to localStorage when email changes
    try {
      localStorage.setItem('cameraNotificationEmail', email);
    } catch (error) {
      console.error('Failed to save email to localStorage:', error);
    }
  };

  const handleScheduleChange = (start: number, end: number) => {
    setStartHour(start);
    setEndHour(end);
  };

  const toggleDetectionZones = (enabled: boolean) => {
    setDetectionZonesEnabled(enabled);
  };

  const handleCooldownChange = (value: number) => {
    setCooldownPeriod(value);
  };

  const handleMinDurationChange = (value: number) => {
    setMinMotionDuration(value);
  };

  const toggleNoiseReduction = (enabled: boolean) => {
    setNoiseReduction(enabled);
  };

  return {
    // State
    isRecording,
    motionDetected,
    motionDetectionEnabled,
    lastMotionTime,
    emailEnabled,
    notificationEmail,
    storageType,
    quality,
    motionSensitivity,
    motionThreshold,
    scheduleEnabled,
    startHour,
    endHour,
    motionEventsToday,
    detectionZonesEnabled,
    cooldownPeriod,
    minMotionDuration,
    noiseReduction,
    
    // Setters
    setIsRecording,
    setStorageType,
    setQuality,
    setMotionSensitivity,
    setMotionThreshold,
    setScheduleEnabled,
    
    // Handlers
    toggleRecording,
    handleMotionDetected,
    toggleMotionDetection,
    toggleEmailNotifications,
    handleEmailChange,
    handleScheduleChange,
    toggleDetectionZones,
    handleCooldownChange,
    handleMinDurationChange,
    toggleNoiseReduction
  };
};

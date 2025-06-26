
import { useState, useEffect } from 'react';

export const useCameraSettings = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [motionDetectionEnabled, setMotionDetectionEnabled] = useState(false);
  const [lastMotionTime, setLastMotionTime] = useState<Date | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [storageType, setStorageType] = useState<'cloud' | 'local'>('cloud');
  const [quality, setQuality] = useState<'high' | 'medium' | 'low'>('medium');
  
  // Enhanced motion detection settings
  const [motionSensitivity, setMotionSensitivity] = useState(70);
  const [motionThreshold, setMotionThreshold] = useState(0.5);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [startHour, setStartHour] = useState(22);
  const [endHour, setEndHour] = useState(6);
  const [motionEventsToday, setMotionEventsToday] = useState(0);

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
    setEmailEnabled(!emailEnabled);
  };

  const handleEmailChange = (email: string) => {
    setNotificationEmail(email);
  };

  const handleScheduleChange = (start: number, end: number) => {
    setStartHour(start);
    setEndHour(end);
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
    handleScheduleChange
  };
};

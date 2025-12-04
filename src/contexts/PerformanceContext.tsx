import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface PerformanceSettings {
  lowPowerMode: boolean;
  motionDetectionInterval: number; // ms
  motionDetectionScale: number; // 0.125 to 1.0 (downsampling factor)
  skipPixels: number; // analyze every Nth pixel
  connectionCheckInterval: number; // ms
}

interface PerformanceContextType {
  settings: PerformanceSettings;
  toggleLowPowerMode: () => void;
  setLowPowerMode: (enabled: boolean) => void;
}

const defaultSettings: PerformanceSettings = {
  lowPowerMode: false,
  motionDetectionInterval: 500,
  motionDetectionScale: 0.25, // 1/4 resolution
  skipPixels: 4, // analyze every 4th pixel
  connectionCheckInterval: 15000, // 15 seconds
};

const lowPowerSettings: PerformanceSettings = {
  lowPowerMode: true,
  motionDetectionInterval: 1000, // 1 FPS
  motionDetectionScale: 0.125, // 1/8 resolution
  skipPixels: 8, // analyze every 8th pixel
  connectionCheckInterval: 30000, // 30 seconds
};

const PerformanceContext = createContext<PerformanceContextType | null>(null);

export const PerformanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lowPowerMode, setLowPowerModeState] = useState(() => {
    const saved = localStorage.getItem('lowPowerMode');
    return saved === 'true';
  });

  const settings = useMemo<PerformanceSettings>(() => {
    return lowPowerMode ? lowPowerSettings : defaultSettings;
  }, [lowPowerMode]);

  const setLowPowerMode = useCallback((enabled: boolean) => {
    setLowPowerModeState(enabled);
    localStorage.setItem('lowPowerMode', String(enabled));
  }, []);

  const toggleLowPowerMode = useCallback(() => {
    setLowPowerMode(!lowPowerMode);
  }, [lowPowerMode, setLowPowerMode]);

  return (
    <PerformanceContext.Provider value={{ settings, toggleLowPowerMode, setLowPowerMode }}>
      {children}
    </PerformanceContext.Provider>
  );
};

export const usePerformance = () => {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformance must be used within a PerformanceProvider');
  }
  return context;
};

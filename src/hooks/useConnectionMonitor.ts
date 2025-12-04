
import { useState, useEffect, useRef, useCallback } from 'react';

interface ConnectionStatus {
  isConnected: boolean;
  lastPingTime: Date | null;
  reconnectAttempts: number;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  latency: number | null;
}

interface ConnectionMonitorOptions {
  checkInterval?: number; // ms between checks (default: 15000)
  stopOnStable?: boolean; // stop checking after stable connection (default: true)
  stableThreshold?: number; // consecutive successes to consider stable (default: 3)
}

export const useConnectionMonitor = (
  targetUrl?: string, 
  enabled: boolean = true,
  options: ConnectionMonitorOptions = {}
) => {
  const {
    checkInterval = 15000,
    stopOnStable = true,
    stableThreshold = 3
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    lastPingTime: null,
    reconnectAttempts: 0,
    connectionQuality: 'disconnected',
    latency: null
  });

  const [autoReconnect, setAutoReconnect] = useState(true);
  const [isMonitoringActive, setIsMonitoringActive] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout>();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const consecutiveSuccessesRef = useRef(0);
  const isStableRef = useRef(false);

  const ping = useCallback(async (): Promise<{ success: boolean; latency: number }> => {
    if (!targetUrl && !navigator.onLine) {
      return { success: false, latency: 0 };
    }

    const startTime = Date.now();
    
    try {
      if (targetUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        await fetch(targetUrl, {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;
        return { success: true, latency };
      } else {
        const latency = Date.now() - startTime;
        return { success: navigator.onLine, latency };
      }
    } catch {
      const latency = Date.now() - startTime;
      return { success: false, latency };
    }
  }, [targetUrl]);

  const updateConnectionStatus = useCallback((isConnected: boolean, latency: number | null = null) => {
    setStatus(prev => ({
      ...prev,
      isConnected,
      lastPingTime: new Date(),
      latency,
      connectionQuality: isConnected 
        ? latency && latency < 100 ? 'excellent'
          : latency && latency < 300 ? 'good'
          : 'poor'
        : 'disconnected'
    }));
  }, []);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    setIsMonitoringActive(false);
  }, []);

  const attemptReconnect = useCallback(() => {
    if (!autoReconnect) return;

    setStatus(prev => ({
      ...prev,
      reconnectAttempts: prev.reconnectAttempts + 1
    }));

    const backoffDelay = Math.min(1000 * Math.pow(2, status.reconnectAttempts), 30000);
    
    reconnectTimeoutRef.current = setTimeout(async () => {
      const result = await ping();
      if (result.success) {
        updateConnectionStatus(true, result.latency);
        setStatus(prev => ({ ...prev, reconnectAttempts: 0 }));
        consecutiveSuccessesRef.current++;
      } else {
        consecutiveSuccessesRef.current = 0;
        attemptReconnect();
      }
    }, backoffDelay);
  }, [autoReconnect, status.reconnectAttempts, ping, updateConnectionStatus]);

  const startMonitoring = useCallback(() => {
    if (!enabled) return;
    
    // Reset stability tracking
    consecutiveSuccessesRef.current = 0;
    isStableRef.current = false;
    setIsMonitoringActive(true);

    const checkConnection = async () => {
      const result = await ping();
      
      if (result.success) {
        updateConnectionStatus(true, result.latency);
        consecutiveSuccessesRef.current++;
        
        // Stop polling if connection is stable and stopOnStable is enabled
        if (stopOnStable && consecutiveSuccessesRef.current >= stableThreshold) {
          console.log('Connection stable, stopping active monitoring');
          isStableRef.current = true;
          stopMonitoring();
        }
        
        if (status.reconnectAttempts > 0) {
          setStatus(prev => ({ ...prev, reconnectAttempts: 0 }));
        }
      } else {
        consecutiveSuccessesRef.current = 0;
        isStableRef.current = false;
        updateConnectionStatus(false);
        if (status.isConnected && autoReconnect) {
          attemptReconnect();
        }
      }
    };

    // Initial check
    checkConnection();
    
    // Set up interval
    intervalRef.current = setInterval(checkConnection, checkInterval);
  }, [enabled, ping, updateConnectionStatus, status.isConnected, status.reconnectAttempts, autoReconnect, attemptReconnect, checkInterval, stopOnStable, stableThreshold, stopMonitoring]);

  const forceReconnect = useCallback(() => {
    isStableRef.current = false;
    consecutiveSuccessesRef.current = 0;
    setStatus(prev => ({ ...prev, reconnectAttempts: 0 }));
    attemptReconnect();
  }, [attemptReconnect]);

  // Resume monitoring if connection was lost (detected via online/offline events)
  useEffect(() => {
    const handleOffline = () => {
      consecutiveSuccessesRef.current = 0;
      isStableRef.current = false;
      updateConnectionStatus(false);
    };

    const handleOnline = () => {
      // Resume monitoring when back online
      if (enabled && !isMonitoringActive) {
        startMonitoring();
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, isMonitoringActive, startMonitoring, updateConnectionStatus]);

  useEffect(() => {
    if (enabled) {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    return stopMonitoring;
  }, [enabled, startMonitoring, stopMonitoring]);

  return {
    status,
    autoReconnect,
    setAutoReconnect,
    forceReconnect,
    startMonitoring,
    stopMonitoring,
    isStable: isStableRef.current
  };
};


import { useState, useEffect, useRef, useCallback } from 'react';

interface ConnectionStatus {
  isConnected: boolean;
  lastPingTime: Date | null;
  reconnectAttempts: number;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  latency: number | null;
}

export const useConnectionMonitor = (targetUrl?: string, enabled: boolean = true) => {
  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    lastPingTime: null,
    reconnectAttempts: 0,
    connectionQuality: 'disconnected',
    latency: null
  });

  const [autoReconnect, setAutoReconnect] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout>();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const ping = useCallback(async (): Promise<{ success: boolean; latency: number }> => {
    if (!targetUrl && !navigator.onLine) {
      return { success: false, latency: 0 };
    }

    const startTime = Date.now();
    
    try {
      if (targetUrl) {
        // For network cameras, try to fetch the stream
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(targetUrl, {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;
        return { success: true, latency };
      } else {
        // For webcam, just check online status
        const latency = Date.now() - startTime;
        return { success: navigator.onLine, latency };
      }
    } catch (error) {
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
      } else {
        attemptReconnect();
      }
    }, backoffDelay);
  }, [autoReconnect, status.reconnectAttempts, ping, updateConnectionStatus]);

  const startMonitoring = useCallback(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(async () => {
      const result = await ping();
      
      if (result.success) {
        updateConnectionStatus(true, result.latency);
        if (status.reconnectAttempts > 0) {
          setStatus(prev => ({ ...prev, reconnectAttempts: 0 }));
        }
      } else {
        updateConnectionStatus(false);
        if (status.isConnected && autoReconnect) {
          attemptReconnect();
        }
      }
    }, 5000); // Check every 5 seconds
  }, [enabled, ping, updateConnectionStatus, status.isConnected, status.reconnectAttempts, autoReconnect, attemptReconnect]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
  }, []);

  const forceReconnect = useCallback(() => {
    setStatus(prev => ({ ...prev, reconnectAttempts: 0 }));
    attemptReconnect();
  }, [attemptReconnect]);

  useEffect(() => {
    if (enabled) {
      startMonitoring();
    } else {
      stopMonitoring();
    }

    return stopMonitoring;
  }, [enabled, startMonitoring, stopMonitoring]);

  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    status,
    autoReconnect,
    setAutoReconnect,
    forceReconnect,
    startMonitoring,
    stopMonitoring
  };
};

import { useEffect, useRef, useCallback, useState } from 'react';

interface AutoReconnectOptions {
  enabled: boolean;
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  onReconnect: () => Promise<void>;
  checkConnection: () => boolean;
  connectionCheckInterval?: number;
}

export const useAutoReconnect = ({
  enabled,
  maxAttempts = 10,
  baseDelay = 2000,
  maxDelay = 60000,
  onReconnect,
  checkConnection,
  connectionCheckInterval = 5000,
}: AutoReconnectOptions) => {
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const checkIntervalRef = useRef<NodeJS.Timeout>();
  const lastConnectionStateRef = useRef(true);

  const calculateDelay = useCallback((attemptNumber: number): number => {
    // Exponential backoff: delay = baseDelay * 2^attempt, capped at maxDelay
    const exponentialDelay = baseDelay * Math.pow(2, attemptNumber);
    return Math.min(exponentialDelay, maxDelay);
  }, [baseDelay, maxDelay]);

  const attemptReconnection = useCallback(async () => {
    if (!enabled || attempts >= maxAttempts) {
      console.log(`Auto-reconnect: ${!enabled ? 'Disabled' : 'Max attempts reached'}`);
      setIsReconnecting(false);
      return;
    }

    const currentAttempt = attempts + 1;
    setAttempts(currentAttempt);
    setIsReconnecting(true);

    const delay = calculateDelay(attempts);
    console.log(`Auto-reconnect: Attempt ${currentAttempt}/${maxAttempts} in ${delay}ms`);

    reconnectTimeoutRef.current = setTimeout(async () => {
      try {
        console.log(`Auto-reconnect: Executing reconnection attempt ${currentAttempt}`);
        await onReconnect();
        
        // Check if reconnection was successful after a short delay
        setTimeout(() => {
          const isNowConnected = checkConnection();
          if (isNowConnected) {
            console.log('Auto-reconnect: Reconnection successful!');
            setAttempts(0);
            setIsReconnecting(false);
            lastConnectionStateRef.current = true;
          } else {
            console.log('Auto-reconnect: Reconnection failed, will retry');
            attemptReconnection();
          }
        }, 2000);
      } catch (error) {
        console.error('Auto-reconnect: Error during reconnection:', error);
        attemptReconnection();
      }
    }, delay);
  }, [enabled, attempts, maxAttempts, calculateDelay, onReconnect, checkConnection]);

  const resetAttempts = useCallback(() => {
    console.log('Auto-reconnect: Resetting attempt counter');
    setAttempts(0);
    setIsReconnecting(false);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
  }, []);

  // Monitor connection state changes
  useEffect(() => {
    if (!enabled) return;

    const checkInterval = setInterval(() => {
      const isConnected = checkConnection();
      const wasConnected = lastConnectionStateRef.current;

      // Connection lost
      if (wasConnected && !isConnected && !isReconnecting) {
        console.log('Auto-reconnect: Connection lost, starting reconnection process');
        lastConnectionStateRef.current = false;
        attemptReconnection();
      }
      // Connection restored (manually or by other means)
      else if (!wasConnected && isConnected) {
        console.log('Auto-reconnect: Connection restored');
        resetAttempts();
        lastConnectionStateRef.current = true;
      }

      lastConnectionStateRef.current = isConnected;
    }, connectionCheckInterval);

    checkIntervalRef.current = checkInterval;

    return () => {
      clearInterval(checkInterval);
    };
  }, [enabled, checkConnection, isReconnecting, attemptReconnection, resetAttempts, connectionCheckInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);

  return {
    isReconnecting,
    attempts,
    resetAttempts,
    forceReconnect: attemptReconnection,
  };
};

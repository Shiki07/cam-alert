import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SystemStatusData {
  isConnected: boolean;
  motionEventsToday: number;
  storageUsed: number; // in MB
  storageTotal: number; // in MB
  lastEventTime: Date | null;
  totalRecordings: number;
}

export const useSystemStatus = () => {
  const { user } = useAuth();
  const sessionStartRef = useRef(Date.now());
  
  const [status, setStatus] = useState<SystemStatusData>({
    isConnected: true,
    motionEventsToday: 0,
    storageUsed: 0,
    storageTotal: 1024,
    lastEventTime: null,
    totalRecordings: 0,
  });
  const [loading, setLoading] = useState(true);

  // Compute uptime on-demand instead of updating state every second
  const uptime = useMemo(() => {
    return Math.floor((Date.now() - sessionStartRef.current) / 1000);
  }, []);

  // Get uptime as a function to always get current value
  const getUptime = useCallback(() => {
    return Math.floor((Date.now() - sessionStartRef.current) / 1000);
  }, []);

  const fetchSystemStatus = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const { data, error } = await supabase
        .from('recordings')
        .select('file_size, recorded_at, motion_detected')
        .eq('user_id', user.id)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) {
        console.error('Error fetching system status:', error);
        return;
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      let storageUsed = 0;
      let motionEventsToday = 0;
      let lastEventTime: Date | null = null;

      data?.forEach(record => {
        if (record.file_size) {
          storageUsed += record.file_size / (1024 * 1024);
        }

        const recordDate = new Date(record.recorded_at);
        if (record.motion_detected && recordDate >= todayStart) {
          motionEventsToday++;
        }

        if (!lastEventTime || recordDate > lastEventTime) {
          lastEventTime = recordDate;
        }
      });

      setStatus(prev => ({
        ...prev,
        storageUsed: Math.round(storageUsed),
        motionEventsToday,
        lastEventTime,
        totalRecordings: data?.length || 0,
      }));

    } catch (error) {
      console.error('Error in fetchSystemStatus:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchSystemStatus();
      
      // Refresh data every 30 seconds
      const interval = setInterval(fetchSystemStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [user, fetchSystemStatus]);

  const updateConnectionStatus = useCallback((connected: boolean) => {
    setStatus(prev => ({ ...prev, isConnected: connected }));
  }, []);

  const refreshStatus = useCallback(() => {
    fetchSystemStatus();
  }, [fetchSystemStatus]);

  return {
    status,
    loading,
    uptime, // Static snapshot for initial render
    getUptime, // Function to get current uptime on-demand
    updateConnectionStatus,
    refreshStatus,
  };
};


import { useState, useEffect, useCallback } from 'react';

export interface DuckDNSConfig {
  domain: string;
  token: string;
  enabled: boolean;
}

export const useDuckDNS = () => {
  const [config, setConfig] = useState<DuckDNSConfig>(() => {
    try {
      const saved = localStorage.getItem('duckdns-config');
      if (saved) {
        return JSON.parse(saved);
      }
      // Initialize with your DuckDNS settings
      return {
        domain: 'alepava.duckdns.org',
        token: '2fcc039f-aac5-4731-9aa0-b78f213ba25a',
        enabled: true
      };
    } catch {
      return {
        domain: 'alepava.duckdns.org',
        token: '2fcc039f-aac5-4731-9aa0-b78f213ba25a',
        enabled: true
      };
    }
  });

  const [currentIP, setCurrentIP] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getCurrentIP = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('Failed to get current IP:', error);
      return null;
    }
  }, []);

  const updateDuckDNS = useCallback(async (ip: string): Promise<boolean> => {
    if (!config.domain || !config.token) {
      console.error('DuckDNS: Missing domain or token');
      return false;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const domain = config.domain.replace('.duckdns.org', '').replace('http://', '').replace('https://', '');
      const url = `https://www.duckdns.org/update?domains=${domain}&token=${config.token}&ip=${ip}`;
      
      const response = await fetch(url);
      const result = await response.text();
      
      if (result.trim() === 'OK') {
        console.log('DuckDNS: Successfully updated IP to', ip);
        setLastUpdate(new Date());
        return true;
      } else {
        throw new Error(`DuckDNS update failed: ${result}`);
      }
    } catch (error) {
      console.error('DuckDNS update error:', error);
      setError(error instanceof Error ? error.message : 'Update failed');
      return false;
    } finally {
      setIsUpdating(false);
    }
  }, [config.domain, config.token]);

  const checkAndUpdateIP = useCallback(async (): Promise<void> => {
    if (!config.enabled) return;

    try {
      const newIP = await getCurrentIP();
      if (!newIP) {
        setError('Failed to detect current IP');
        return;
      }

      if (newIP !== currentIP) {
        console.log('DuckDNS: IP changed from', currentIP, 'to', newIP);
        setCurrentIP(newIP);
        
        const success = await updateDuckDNS(newIP);
        if (!success) {
          setError('Failed to update DuckDNS');
        }
      }
    } catch (error) {
      console.error('DuckDNS check error:', error);
      setError(error instanceof Error ? error.message : 'Check failed');
    }
  }, [config.enabled, currentIP, getCurrentIP, updateDuckDNS]);

  const updateConfig = useCallback((newConfig: Partial<DuckDNSConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    localStorage.setItem('duckdns-config', JSON.stringify(updatedConfig));
  }, [config]);

  const getDuckDNSUrl = useCallback((port: number): string => {
    if (!config.domain || !config.enabled) return '';
    
    const domain = config.domain.includes('.duckdns.org') 
      ? config.domain 
      : `${config.domain}.duckdns.org`;
    
    return `http://${domain}:${port}`;
  }, [config.domain, config.enabled]);

  // Auto-check IP every 5 minutes when enabled
  useEffect(() => {
    if (!config.enabled) return;

    // Initial check
    checkAndUpdateIP();

    // Set up interval
    const interval = setInterval(checkAndUpdateIP, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [config.enabled, checkAndUpdateIP]);

  // Save config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('duckdns-config', JSON.stringify(config));
  }, [config]);

  return {
    config,
    currentIP,
    isUpdating,
    lastUpdate,
    error,
    updateConfig,
    checkAndUpdateIP,
    getDuckDNSUrl,
    manualUpdate: async () => {
      const ip = await getCurrentIP();
      if (ip) {
        await updateDuckDNS(ip);
      }
    }
  };
};

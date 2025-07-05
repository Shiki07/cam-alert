
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
    // Try multiple IP detection services to avoid CORS issues
    const ipServices = [
      'https://ipv4.icanhazip.com/',
      'https://api.ipify.org?format=text',
      'https://checkip.amazonaws.com/',
      'https://ipinfo.io/ip'
    ];

    for (const service of ipServices) {
      try {
        console.log(`Trying IP service: ${service}`);
        const response = await fetch(service, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache'
        });
        
        if (response.ok) {
          const ip = (await response.text()).trim();
          console.log(`Successfully got IP from ${service}: ${ip}`);
          return ip;
        }
      } catch (error) {
        console.log(`Failed to get IP from ${service}:`, error);
        continue;
      }
    }

    console.error('Failed to get current IP from all sources');
    return null;
  }, []);

  const updateDuckDNS = useCallback(async (ip: string): Promise<boolean> => {
    if (!config.domain || !config.token) {
      console.error('DuckDNS: Missing domain or token');
      setError('Missing DuckDNS domain or token');
      return false;
    }

    setIsUpdating(true);
    setError(null);

    try {
      console.log(`Updating DuckDNS via Edge Function for domain: ${config.domain} with IP: ${ip}`);
      
      // Use Supabase Edge Function to update DuckDNS
      const { data, error: functionError } = await supabase.functions.invoke('duckdns-update', {
        body: {
          domain: config.domain,
          token: config.token,
          ip: ip
        }
      });

      if (functionError) {
        throw new Error(`Edge Function error: ${functionError.message}`);
      }

      if (data?.success) {
        console.log('DuckDNS: Successfully updated IP to', ip);
        setLastUpdate(new Date());
        setError(null);
        return true;
      } else {
        throw new Error(data?.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('DuckDNS update error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Update failed';
      setError(errorMsg);
      return false;
    } finally {
      setIsUpdating(false);
    }
  }, [config.domain, config.token]);

  const checkAndUpdateIP = useCallback(async (): Promise<void> => {
    if (!config.enabled) {
      console.log('DuckDNS: Service disabled, skipping IP check');
      return;
    }

    try {
      setError(null);
      const newIP = await getCurrentIP();
      
      if (!newIP) {
        setError('Unable to detect current IP address. This may be due to browser security restrictions.');
        return;
      }

      // Always update the current IP, even if we can't compare with previous
      setCurrentIP(newIP);

      // If this is a new IP or we don't have a previous update, update DuckDNS
      if (!lastUpdate || newIP !== currentIP) {
        console.log('DuckDNS: IP changed or first run, updating...', { previous: currentIP, new: newIP });
        
        const success = await updateDuckDNS(newIP);
        if (!success) {
          setError('Failed to update DuckDNS - please check your domain and token');
        } else {
          console.log('DuckDNS: Update successful');
        }
      } else {
        console.log('DuckDNS: IP unchanged, no update needed');
      }
    } catch (error) {
      console.error('DuckDNS check error:', error);
      setError(error instanceof Error ? error.message : 'IP check failed');
    }
  }, [config.enabled, currentIP, lastUpdate, getCurrentIP, updateDuckDNS]);

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

  // Auto-check IP every 15 minutes when enabled (increased to reduce load)
  useEffect(() => {
    if (!config.enabled) return;

    // Initial check with delay to avoid immediate errors on page load
    const initialTimeout = setTimeout(() => {
      checkAndUpdateIP();
    }, 3000);

    // Set up interval - check every 15 minutes
    const interval = setInterval(checkAndUpdateIP, 15 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
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
      console.log('Manual DuckDNS update requested');
      const ip = await getCurrentIP();
      if (ip) {
        setCurrentIP(ip);
        await updateDuckDNS(ip);
      } else {
        setError('Could not detect current IP for manual update');
      }
    }
  };
};

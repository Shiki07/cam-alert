
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DuckDNSConfig {
  domain: string;
  enabled: boolean;
}

export const useDuckDNS = () => {
  const [config, setConfig] = useState<DuckDNSConfig>(() => {
    try {
      const saved = localStorage.getItem('duckdns-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Remove token from client-side config for security
        return {
          domain: parsed.domain || '',
          enabled: parsed.enabled || false
        };
      }
      return {
        domain: '',
        enabled: false
      };
    } catch {
      return {
        domain: '',
        enabled: false
      };
    }
  });

  const [currentIP, setCurrentIP] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getCurrentIP = useCallback(async (): Promise<string | null> => {
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
    if (!config.domain) {
      console.error('DuckDNS: Missing domain');
      setError('Missing DuckDNS domain');
      return false;
    }

    setIsUpdating(true);
    setError(null);

    try {
      console.log(`Updating DuckDNS via Edge Function for domain: ${config.domain} with IP: ${ip}`);
      
      const { data, error: functionError } = await supabase.functions.invoke('duckdns-update', {
        body: {
          domain: config.domain,
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
  }, [config.domain]);

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

      setCurrentIP(newIP);

      if (!lastUpdate || newIP !== currentIP) {
        console.log('DuckDNS: IP changed or first run, updating...', { previous: currentIP, new: newIP });
        
        const success = await updateDuckDNS(newIP);
        if (!success) {
          setError('Failed to update DuckDNS - please check your configuration');
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

  useEffect(() => {
    if (!config.enabled) return;

    const initialTimeout = setTimeout(() => {
      checkAndUpdateIP();
    }, 3000);

    const interval = setInterval(checkAndUpdateIP, 15 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [config.enabled, checkAndUpdateIP]);

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

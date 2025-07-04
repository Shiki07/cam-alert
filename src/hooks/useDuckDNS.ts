
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

    // If all services fail, try to get IP through DuckDNS update (it returns current IP)
    try {
      console.log('All IP services failed, trying DuckDNS detection...');
      if (config.domain && config.token) {
        const domain = config.domain.replace('.duckdns.org', '').replace('http://', '').replace('https://', '');
        const url = `https://www.duckdns.org/update?domains=${domain}&token=${config.token}&ip=`;
        
        const response = await fetch(url);
        const result = await response.text();
        
        if (result.includes('OK')) {
          // DuckDNS doesn't return the IP directly, so we'll use a fallback
          console.log('DuckDNS responded OK, but IP detection still failed');
        }
      }
    } catch (error) {
      console.error('DuckDNS IP detection also failed:', error);
    }

    console.error('Failed to get current IP from all sources');
    return null;
  }, [config.domain, config.token]);

  const updateDuckDNS = useCallback(async (ip: string): Promise<boolean> => {
    if (!config.domain || !config.token) {
      console.error('DuckDNS: Missing domain or token');
      setError('Missing DuckDNS domain or token');
      return false;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const domain = config.domain.replace('.duckdns.org', '').replace('http://', '').replace('https://', '');
      const url = `https://www.duckdns.org/update?domains=${domain}&token=${config.token}&ip=${ip}`;
      
      console.log(`Updating DuckDNS for domain: ${domain} with IP: ${ip}`);
      
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors'
      });
      const result = await response.text();
      
      if (result.trim() === 'OK') {
        console.log('DuckDNS: Successfully updated IP to', ip);
        setLastUpdate(new Date());
        setError(null);
        return true;
      } else {
        throw new Error(`DuckDNS update failed: ${result}`);
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

  // Auto-check IP every 10 minutes when enabled (increased from 5 to reduce load)
  useEffect(() => {
    if (!config.enabled) return;

    // Initial check with delay to avoid immediate errors on page load
    const initialTimeout = setTimeout(() => {
      checkAndUpdateIP();
    }, 2000);

    // Set up interval - check every 10 minutes
    const interval = setInterval(checkAndUpdateIP, 10 * 60 * 1000);

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

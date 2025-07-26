import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DuckDNSConfig {
  domain: string;
  enabled: boolean;
  manualIP?: string;
}

export const useDuckDNS = () => {
  const [config, setConfig] = useState<DuckDNSConfig>(() => {
    try {
      const saved = localStorage.getItem('duckdns-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          domain: parsed.domain || '',
          enabled: parsed.enabled || false,
          manualIP: parsed.manualIP || ''
        };
      }
      return {
        domain: '',
        enabled: false,
        manualIP: ''
      };
    } catch {
      return {
        domain: '',
        enabled: false,
        manualIP: ''
      };
    }
  });

  const [currentIP, setCurrentIP] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getCurrentIP = useCallback(async (): Promise<string | null> => {
    // If manual IP override is set, use it instead of auto-detection
    if (config.manualIP && config.manualIP.trim()) {
      console.log(`Using manual IP override: ${config.manualIP}`);
      return config.manualIP.trim();
    }

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
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
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
  }, [config.manualIP]);

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
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required for DuckDNS update');
      }

      const { data, error: functionError } = await supabase.functions.invoke('duckdns-update', {
        body: {
          domain: config.domain,
          ip: ip
        },
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (functionError) {
        console.error('DuckDNS function error:', functionError);
        // Handle different types of function errors
        if (functionError.message?.includes('FunctionsFetchError')) {
          throw new Error('Network connection failed. Please check your internet connection and try again.');
        } else if (functionError.message?.includes('timeout')) {
          throw new Error('Request timeout. The DuckDNS service may be temporarily unavailable.');
        } else {
          throw new Error(`Service error: ${functionError.message}`);
        }
      }

      if (data?.success) {
        console.log('DuckDNS: Successfully updated IP to', ip);
        setLastUpdate(new Date());
        setError(null);
        return true;
      } else {
        const errorMsg = data?.error || 'Unknown error occurred';
        console.error('DuckDNS update failed:', errorMsg);
        
        // Provide more helpful error messages
        if (errorMsg.includes('token not configured')) {
          setError('DuckDNS token not configured. Please save your token in settings first.');
        } else if (errorMsg.includes('Invalid domain')) {
          setError('Invalid domain format. Please check your domain name.');
        } else if (errorMsg.includes('Rate limit')) {
          setError('Too many requests. Please wait before trying again.');
        } else {
          setError(`DuckDNS update failed: ${errorMsg}`);
        }
        return false;
      }
    } catch (error) {
      console.error('DuckDNS update error:', error);
      let errorMsg = error instanceof Error ? error.message : 'Update failed';
      
      // Provide more helpful error messages
      if (errorMsg.includes('Authentication required')) {
        errorMsg = 'Please log in to update DuckDNS';
      } else if (errorMsg.includes('non-2xx status code')) {
        errorMsg = 'DuckDNS service error. Please check your token and domain configuration.';
      }
      
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
        if (success) {
          console.log('DuckDNS: Update successful');
          // Force DNS cache refresh by triggering diagnostics after a delay
          setTimeout(async () => {
            console.log('DuckDNS: Triggering camera diagnostics to clear DNS cache...');
            try {
              const domain = config.domain.includes('.duckdns.org') 
                ? config.domain 
                : `${config.domain}.duckdns.org`;
              const cameraUrl = `http://${domain}:8081`;
              
              await supabase.functions.invoke('camera-diagnostics', {
                body: { url: cameraUrl }
              });
              console.log('DuckDNS: Camera diagnostics completed after IP update');
            } catch (error) {
              console.log('DuckDNS: Failed to trigger diagnostics:', error);
            }
          }, 10000); // Wait 10 seconds for DNS propagation
        } else {
          // Error is already set in updateDuckDNS
          console.log('DuckDNS: Update failed, error already set');
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

  const isDuckDNSUrl = useCallback((url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('.duckdns.org') || 
             (config.domain && urlObj.hostname.includes(config.domain));
    } catch {
      return false;
    }
  }, [config.domain]);

  const getCameraUrlWithDuckDNS = useCallback((port: number, path: string = '/stream.mjpg'): string => {
    if (!config.enabled || !config.domain) {
      return '';
    }
    
    const domain = config.domain.includes('.duckdns.org') 
      ? config.domain 
      : `${config.domain}.duckdns.org`;
    
    return `http://${domain}:${port}${path}`;
  }, [config.domain, config.enabled]);

  useEffect(() => {
    if (!config.enabled) return;

    // Initial check after 3 seconds
    const initialTimeout = setTimeout(() => {
      checkAndUpdateIP();
    }, 3000);

    // Regular checks every 5 minutes (more frequent for better IP change detection)
    const interval = setInterval(checkAndUpdateIP, 5 * 60 * 1000);

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
    isDuckDNSUrl,
    getCameraUrlWithDuckDNS,
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

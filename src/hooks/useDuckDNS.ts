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
  const [updatePromise, setUpdatePromise] = useState<Promise<boolean> | null>(null);
  const [lastKnownIP, setLastKnownIP] = useState<string | null>(null);

  const getCurrentIP = useCallback(async (): Promise<string | null> => {
    // If manual IP override is set, use it instead of auto-detection
    if (config.manualIP && config.manualIP.trim()) {
      console.log(`Using manual IP override: ${config.manualIP}`);
      return config.manualIP.trim();
    }

    // Use multiple reliable IP services with better error handling
    const ipServices = [
      'https://checkip.amazonaws.com/',
      'https://ipv4.icanhazip.com/',
      'https://api.ipify.org'
    ];

    for (const service of ipServices) {
      try {
        console.log(`Trying IP service: ${service}`);
        
        // Create a manual timeout for better browser compatibility
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(service, {
          method: 'GET',
          cache: 'no-cache',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const ip = (await response.text()).trim();
          console.log(`Successfully got IP from ${service}: ${ip}`);
          
          // Basic IP validation
          if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
            return ip;
          } else {
            console.log(`Invalid IP format from ${service}: ${ip}`);
            continue;
          }
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

    // Prevent multiple simultaneous updates
    if (updatePromise) {
      console.log('DuckDNS: Update already in progress, waiting...');
      return await updatePromise;
    }

    const promise = (async (): Promise<boolean> => {
      setIsUpdating(true);
      setError(null);

      try {
        console.log(`Updating DuckDNS via Edge Function for domain: ${config.domain} with IP: ${ip}`);
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Authentication required for DuckDNS update. Please log in.');
        }

        console.log('Calling DuckDNS update function...');
        
        // Retry invoke to handle transient network/routing issues
        let data: any = null;
        let functionError: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          const resp = await supabase.functions.invoke('duckdns-update', {
            body: { domain: config.domain, ip }
          });
          data = resp.data;
          functionError = resp.error;

          if (!functionError) break;

          const msg = functionError.message || '';
          const retryable = msg.includes('FunctionsFetchError') || msg.includes('Failed to send') || msg.includes('Failed to fetch');
          if (retryable && attempt < 3) {
            console.log(`DuckDNS: invoke failed (attempt ${attempt}/3). Retrying...`);
            await new Promise(r => setTimeout(r, 500 * attempt));
            continue;
          }
          break;
        }


        if (functionError) {
          console.error('DuckDNS function error:', functionError);
          // Handle different types of function errors
          if (functionError.message?.includes('FunctionsFetchError') || functionError.message?.includes('Failed to fetch')) {
            throw new Error('Network connection failed. Please check your internet connection and try again.');
          } else if (functionError.message?.includes('timeout')) {
            throw new Error('Request timeout. The DuckDNS service may be temporarily unavailable.');
          } else if (functionError.message?.includes('401') || functionError.message?.includes('Unauthorized')) {
            throw new Error('Authentication failed. Please log in again.');
          } else if (functionError.message?.includes('non-2xx status code')) {
            throw new Error('DuckDNS API temporarily unavailable. DNS lookup may be failing. Will retry automatically.');
          } else {
            throw new Error(`Service error: ${functionError.message || 'Unknown error'}`);
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
        } else if (errorMsg.includes('temporarily unavailable')) {
          errorMsg = 'DuckDNS service temporarily unavailable. Will retry automatically.';
        }
        
        setError(errorMsg);
        return false;
      } finally {
        setIsUpdating(false);
        setUpdatePromise(null);
      }
    })();

    setUpdatePromise(promise);
    return await promise;
  }, [config.domain, updatePromise]);

  const checkAndUpdateIP = useCallback(async (): Promise<void> => {
    if (!config.enabled) {
      console.log('DuckDNS: Service disabled, skipping IP check');
      return;
    }

    try {
      setError(null);
      console.log('DuckDNS: Starting IP check...');
      const newIP = await getCurrentIP();
      
      if (!newIP) {
        setError('Unable to detect current IP address. Please check your internet connection or use manual IP override.');
        return;
      }

      console.log('DuckDNS: Current IP detected:', newIP);
      setCurrentIP(newIP);

      if (!lastUpdate || newIP !== lastKnownIP) {
        console.log('DuckDNS: IP changed or first run, updating...', { previous: lastKnownIP, new: newIP });
        
        const success = await updateDuckDNS(newIP);
        if (success) {
          setLastKnownIP(newIP); // Store the IP we just updated
          console.log('DuckDNS: Update successful');
          // Force DNS cache refresh by triggering diagnostics after a delay
          setTimeout(async () => {
            console.log('DuckDNS: Triggering camera diagnostics to clear DNS cache...');
            try {
              const domain = config.domain.includes('.duckdns.org') 
                ? config.domain 
                : `${config.domain}.duckdns.org`;
              const ports = [8000];
              for (const port of ports) {
                const cameraUrl = `http://${domain}:${port}`;
                try {
                  await supabase.functions.invoke('camera-diagnostics', { body: { url: cameraUrl } });
                  console.log(`DuckDNS: Camera diagnostics completed after IP update on port ${port}`);
                } catch (e) {
                  console.log(`DuckDNS: Failed to trigger diagnostics on port ${port}:`, e);
                }
              }
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
  }, [config.enabled, lastKnownIP, lastUpdate, getCurrentIP, updateDuckDNS]);

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

    // Regular checks every 5 minutes
    const interval = setInterval(() => {
      // Only run if not currently updating to prevent overlapping calls
      if (!isUpdating && !updatePromise) {
        checkAndUpdateIP();
      }
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [config.enabled, checkAndUpdateIP, isUpdating, updatePromise]);

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

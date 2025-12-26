import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DuckDNSConfig {
  domain: string;
  enabled: boolean;
  manualIP?: string;
}

export const useDuckDNS = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<DuckDNSConfig>({
    domain: '',
    enabled: false,
    manualIP: ''
  });
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  const [currentIP, setCurrentIP] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatePromise, setUpdatePromise] = useState<Promise<boolean> | null>(null);
  const [lastKnownIP, setLastKnownIP] = useState<string | null>(null);

  // Load config from database
  useEffect(() => {
    const loadConfig = async () => {
      if (!user?.id) {
        setIsLoadingConfig(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('duckdns_domain, duckdns_enabled, duckdns_manual_ip')
          .eq('id', user.id)
          .single();

        if (fetchError) {
          console.error('Error loading DuckDNS config:', fetchError);
        } else if (data) {
          setConfig({
            domain: data.duckdns_domain || '',
            enabled: data.duckdns_enabled || false,
            manualIP: data.duckdns_manual_ip || ''
          });
        }
      } catch (e) {
        console.error('Error loading DuckDNS config:', e);
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadConfig();
  }, [user?.id]);

  const getCurrentIP = useCallback(async (): Promise<string | null> => {
    // If manual IP override is set, use it instead of auto-detection
    if (config.manualIP && config.manualIP.trim()) {
      console.log('Using manual IP override');
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
          
          // Basic IP validation
          if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
            return ip;
          }
        }
      } catch (error) {
        console.log(`Failed to get IP from service:`, error);
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
        console.log('Updating DuckDNS via Edge Function');
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Authentication required for DuckDNS update. Please log in.');
        }

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
          if (functionError.message?.includes('FunctionsFetchError') || functionError.message?.includes('Failed to fetch')) {
            throw new Error('Network connection failed. Please check your internet connection and try again.');
          } else if (functionError.message?.includes('timeout')) {
            throw new Error('Request timeout. The DuckDNS service may be temporarily unavailable.');
          } else if (functionError.message?.includes('401') || functionError.message?.includes('Unauthorized')) {
            throw new Error('Authentication failed. Please log in again.');
          } else if (functionError.message?.includes('non-2xx status code')) {
            throw new Error('DuckDNS API temporarily unavailable. Will retry automatically.');
          } else {
            throw new Error(`Service error: ${functionError.message || 'Unknown error'}`);
          }
        }

        if (data?.success) {
          console.log('DuckDNS: Successfully updated IP');
          setLastUpdate(new Date());
          setError(null);
          return true;
        } else {
          const errorMsg = data?.error || 'Unknown error occurred';
          console.error('DuckDNS update failed:', errorMsg);
          
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
      return;
    }

    try {
      setError(null);
      const newIP = await getCurrentIP();
      
      if (!newIP) {
        setError('Unable to detect current IP address. Please check your internet connection or use manual IP override.');
        return;
      }

      setCurrentIP(newIP);

      if (!lastUpdate || newIP !== lastKnownIP) {
        console.log('DuckDNS: IP changed or first run, updating...');
        
        const success = await updateDuckDNS(newIP);
        if (success) {
          setLastKnownIP(newIP);
          // Force DNS cache refresh by triggering diagnostics after a delay
          setTimeout(async () => {
            try {
              const domain = config.domain.includes('.duckdns.org') 
                ? config.domain 
                : `${config.domain}.duckdns.org`;
              const ports = [8000];
              for (const port of ports) {
                const cameraUrl = `http://${domain}:${port}`;
                try {
                  await supabase.functions.invoke('camera-diagnostics', { body: { url: cameraUrl } });
                } catch (e) {
                  console.log(`Failed to trigger diagnostics on port ${port}:`, e);
                }
              }
            } catch (error) {
              console.log('Failed to trigger diagnostics:', error);
            }
          }, 10000);
        }
      }
    } catch (error) {
      console.error('DuckDNS check error:', error);
      setError(error instanceof Error ? error.message : 'IP check failed');
    }
  }, [config.enabled, config.domain, lastKnownIP, lastUpdate, getCurrentIP, updateDuckDNS]);

  // SECURITY: Save config to database instead of localStorage
  const updateConfig = useCallback(async (newConfig: Partial<DuckDNSConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);

    if (!user?.id) return;

    try {
      await supabase
        .from('profiles')
        .update({
          duckdns_domain: updatedConfig.domain || null,
          duckdns_enabled: updatedConfig.enabled,
          duckdns_manual_ip: updatedConfig.manualIP || null,
        })
        .eq('id', user.id);
    } catch (e) {
      console.error('Error saving DuckDNS config:', e);
    }
  }, [config, user?.id]);

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
    if (!config.enabled || isLoadingConfig) return;

    // Initial check after 3 seconds  
    const initialTimeout = setTimeout(() => {
      checkAndUpdateIP();
    }, 3000);

    // Regular checks every 5 minutes
    const interval = setInterval(() => {
      if (!isUpdating && !updatePromise) {
        checkAndUpdateIP();
      }
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [config.enabled, isLoadingConfig, checkAndUpdateIP, isUpdating, updatePromise]);

  return {
    config,
    currentIP,
    isUpdating,
    lastUpdate,
    error,
    isLoadingConfig,
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

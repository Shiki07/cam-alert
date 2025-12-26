import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserPreferences {
  notification_email: string | null;
  email_notifications_enabled: boolean;
  duckdns_domain: string | null;
  duckdns_enabled: boolean;
  duckdns_manual_ip: string | null;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  notification_email: null,
  email_notifications_enabled: false,
  duckdns_domain: null,
  duckdns_enabled: false,
  duckdns_manual_ip: null,
};

export const useUserPreferences = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load preferences from database
  const loadPreferences = useCallback(async () => {
    if (!user?.id) {
      setPreferences(DEFAULT_PREFERENCES);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('notification_email, email_notifications_enabled, duckdns_domain, duckdns_enabled, duckdns_manual_ip')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        console.error('Error loading preferences:', fetchError);
        setError('Failed to load preferences');
        return;
      }

      if (data) {
        setPreferences({
          notification_email: data.notification_email,
          email_notifications_enabled: data.email_notifications_enabled ?? false,
          duckdns_domain: data.duckdns_domain,
          duckdns_enabled: data.duckdns_enabled ?? false,
          duckdns_manual_ip: data.duckdns_manual_ip,
        });
      }
    } catch (e) {
      console.error('Error loading preferences:', e);
      setError('Failed to load preferences');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Save preferences to database
  const savePreferences = useCallback(async (updates: Partial<UserPreferences>): Promise<boolean> => {
    if (!user?.id) {
      console.error('Cannot save preferences: no user');
      return false;
    }

    try {
      setError(null);

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (updateError) {
        console.error('Error saving preferences:', updateError);
        setError('Failed to save preferences');
        return false;
      }

      // Update local state
      setPreferences(prev => ({ ...prev, ...updates }));
      return true;
    } catch (e) {
      console.error('Error saving preferences:', e);
      setError('Failed to save preferences');
      return false;
    }
  }, [user?.id]);

  // Load preferences when user changes
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return {
    preferences,
    isLoading,
    error,
    savePreferences,
    reloadPreferences: loadPreferences,
  };
};

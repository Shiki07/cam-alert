import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface CameraCredential {
  id: string;
  camera_label: string;
  scheme: string;
  host: string;
  port: number;
  path: string;
  username: string | null;
  password_ciphertext: string | null;
}

interface DecryptedCameraCredential extends Omit<CameraCredential, 'password_ciphertext'> {
  password?: string;
  needsMigration?: boolean;
}

/**
 * Server-side encryption via credential-vault Edge Function
 * Passwords are encrypted/decrypted on the server using a secret key
 */
export const useCameraCredentials = () => {
  const [credentials, setCredentials] = useState<DecryptedCameraCredential[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Encrypt password using server-side vault
  const encryptPasswordServerSide = useCallback(async (password: string): Promise<string> => {
    if (!password) return '';
    
    const { data, error: invokeError } = await supabase.functions.invoke('credential-vault', {
      body: { action: 'encrypt', password }
    });

    if (invokeError) {
      console.error('Server encryption failed:', invokeError);
      throw new Error('Failed to encrypt credential');
    }

    if (!data?.success || !data?.ciphertext) {
      throw new Error(data?.error || 'Encryption failed');
    }

    return data.ciphertext;
  }, []);

  // Decrypt password using server-side vault
  const decryptPasswordServerSide = useCallback(async (credentialId: string): Promise<string> => {
    const { data, error: invokeError } = await supabase.functions.invoke('credential-vault', {
      body: { action: 'decrypt', credentialId }
    });

    if (invokeError) {
      console.error('Server decryption failed:', invokeError);
      return '';
    }

    return data?.password || '';
  }, []);

  // Fetch all camera credentials for current user
  const fetchCredentials = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCredentials([]);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('camera_credentials')
        .select('*')
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Map credentials without decrypting passwords (decrypt on-demand)
      const mappedCredentials: DecryptedCameraCredential[] = (data || []).map((cred) => ({
        id: cred.id,
        camera_label: cred.camera_label,
        scheme: cred.scheme,
        host: cred.host,
        port: cred.port,
        path: cred.path,
        username: cred.username,
        // Check if credential needs migration (v1 -> v2)
        needsMigration: cred.password_ciphertext ? !cred.password_ciphertext.startsWith('v2:') : false
      }));

      setCredentials(mappedCredentials);
    } catch (err) {
      console.error('Error fetching camera credentials:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch credentials');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save camera credential with server-side encryption
  const saveCredential = useCallback(async (
    cameraLabel: string,
    url: string,
    username?: string,
    password?: string
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Parse URL to extract components
      const urlObj = new URL(url);
      const scheme = urlObj.protocol.replace(':', '');
      const host = urlObj.hostname;
      const port = urlObj.port ? parseInt(urlObj.port) : (scheme === 'https' ? 443 : 80);
      const path = urlObj.pathname + urlObj.search;

      // Encrypt password server-side if provided
      let passwordCiphertext: string | null = null;
      if (password) {
        passwordCiphertext = await encryptPasswordServerSide(password);
      }

      const { error: upsertError } = await supabase
        .from('camera_credentials')
        .upsert({
          user_id: user.id,
          camera_label: cameraLabel,
          scheme,
          host,
          port,
          path,
          username: username || null,
          password_ciphertext: passwordCiphertext
        }, {
          onConflict: 'user_id,camera_label'
        });

      if (upsertError) throw upsertError;

      // Refresh credentials list
      await fetchCredentials();
      return true;
    } catch (err) {
      console.error('Error saving camera credential:', err);
      setError(err instanceof Error ? err.message : 'Failed to save credential');
      return false;
    }
  }, [encryptPasswordServerSide, fetchCredentials]);

  // Delete camera credential
  const deleteCredential = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('camera_credentials')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Remove from local state
      setCredentials(prev => prev.filter(c => c.id !== id));
      return true;
    } catch (err) {
      console.error('Error deleting camera credential:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete credential');
      return false;
    }
  }, []);

  // Get decrypted password for a specific camera (on-demand)
  const getDecryptedPassword = useCallback(async (cameraLabel: string): Promise<string | null> => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('credential-vault', {
        body: { action: 'decrypt-by-label', cameraLabel }
      });

      if (invokeError) {
        console.error('Failed to decrypt password:', invokeError);
        return null;
      }

      return data?.password || null;
    } catch (err) {
      console.error('Error getting decrypted password:', err);
      return null;
    }
  }, []);

  // Get decrypted password by credential ID
  const getDecryptedPasswordById = useCallback(async (credentialId: string): Promise<string | null> => {
    try {
      const password = await decryptPasswordServerSide(credentialId);
      return password || null;
    } catch (err) {
      console.error('Error getting decrypted password:', err);
      return null;
    }
  }, [decryptPasswordServerSide]);

  // Check if any credentials need migration from v1 to v2 encryption
  const checkMigrationNeeded = useCallback(async (): Promise<{ needed: boolean; count: number; ids: string[] }> => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('credential-vault', {
        body: { action: 'check-migration' }
      });

      if (invokeError) {
        console.error('Migration check failed:', invokeError);
        return { needed: false, count: 0, ids: [] };
      }

      return {
        needed: data?.needsMigration || false,
        count: data?.count || 0,
        ids: data?.credentialIds || []
      };
    } catch (err) {
      console.error('Error checking migration:', err);
      return { needed: false, count: 0, ids: [] };
    }
  }, []);

  // Load credentials on mount
  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  return {
    credentials,
    isLoading,
    error,
    saveCredential,
    deleteCredential,
    getDecryptedPassword,
    getDecryptedPasswordById,
    refreshCredentials: fetchCredentials,
    checkMigrationNeeded
  };
};

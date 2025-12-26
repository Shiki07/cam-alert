import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { encryptPassword, decryptPassword } from '@/utils/credentialEncryption';

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
}

export const useCameraCredentials = () => {
  const [credentials, setCredentials] = useState<DecryptedCameraCredential[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get current user ID
  const getUserId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  }, []);

  // Fetch and decrypt all camera credentials for current user
  const fetchCredentials = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const userId = await getUserId();
      if (!userId) {
        setCredentials([]);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('camera_credentials')
        .select('*')
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      // Decrypt passwords for each credential
      const decryptedCredentials: DecryptedCameraCredential[] = await Promise.all(
        (data || []).map(async (cred) => {
          let password: string | undefined;
          
          if (cred.password_ciphertext) {
            try {
              password = await decryptPassword(cred.password_ciphertext, userId);
            } catch {
              console.warn('Failed to decrypt password for camera:', cred.camera_label);
              password = undefined;
            }
          }

          return {
            id: cred.id,
            camera_label: cred.camera_label,
            scheme: cred.scheme,
            host: cred.host,
            port: cred.port,
            path: cred.path,
            username: cred.username,
            password
          };
        })
      );

      setCredentials(decryptedCredentials);
    } catch (err) {
      console.error('Error fetching camera credentials:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch credentials');
    } finally {
      setIsLoading(false);
    }
  }, [getUserId]);

  // Save camera credential with encrypted password
  const saveCredential = useCallback(async (
    cameraLabel: string,
    url: string,
    username?: string,
    password?: string
  ): Promise<boolean> => {
    try {
      const userId = await getUserId();
      if (!userId) {
        throw new Error('User not authenticated');
      }

      // Parse URL to extract components
      const urlObj = new URL(url);
      const scheme = urlObj.protocol.replace(':', '');
      const host = urlObj.hostname;
      const port = urlObj.port ? parseInt(urlObj.port) : (scheme === 'https' ? 443 : 80);
      const path = urlObj.pathname + urlObj.search;

      // Encrypt password if provided
      let passwordCiphertext: string | null = null;
      if (password) {
        passwordCiphertext = await encryptPassword(password, userId);
      }

      const { error: upsertError } = await supabase
        .from('camera_credentials')
        .upsert({
          user_id: userId,
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
  }, [getUserId, fetchCredentials]);

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

  // Get decrypted password for a specific camera
  const getDecryptedPassword = useCallback(async (cameraLabel: string): Promise<string | null> => {
    const cred = credentials.find(c => c.camera_label === cameraLabel);
    return cred?.password || null;
  }, [credentials]);

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
    refreshCredentials: fetchCredentials
  };
};

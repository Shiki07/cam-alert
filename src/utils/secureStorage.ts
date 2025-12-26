/**
 * Secure Storage Utility
 * 
 * SECURITY: This utility manages localStorage access with security best practices:
 * - Categorizes data as sensitive vs non-sensitive
 * - Provides cleanup functions for logout
 * - Centralizes localStorage key management
 */

// Keys for SENSITIVE data that should be cleared on logout
export const SENSITIVE_STORAGE_KEYS = [
  'networkCameras', // May contain camera URLs (passwords should be in DB)
  'duckdns-config', // Contains domain config (token is server-side)
  'cameraNotificationEmail', // User email address
  'cloudStorageConfig', // Cloud provider settings
  'piEndpoint', // Pi service URLs
] as const;

// User-specific sensitive keys pattern
export const getUserSensitiveKey = (baseKey: string, userId: string): string => {
  return `${baseKey}:${userId}`;
};

// Keys for NON-SENSITIVE data that can persist
export const NON_SENSITIVE_STORAGE_KEYS = [
  'lowPowerMode', // Boolean UI preference
  'selectedDirectoryName', // Just a display name
  'cameraSystemAlerts', // Boolean toggle
  'storageTier', // Tier name string
  'theme', // UI theme preference
] as const;

/**
 * Clear all sensitive data from localStorage
 * Should be called on logout
 */
export const clearSensitiveStorage = (userId?: string): void => {
  console.log('Clearing sensitive localStorage data...');
  
  // Clear base sensitive keys
  SENSITIVE_STORAGE_KEYS.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to remove ${key} from localStorage:`, e);
    }
  });

  // Clear user-specific keys if userId provided
  if (userId) {
    SENSITIVE_STORAGE_KEYS.forEach(key => {
      try {
        localStorage.removeItem(getUserSensitiveKey(key, userId));
      } catch (e) {
        console.warn(`Failed to remove user-specific ${key} from localStorage:`, e);
      }
    });
  }

  // Also scan for any keys that might contain sensitive patterns
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        // Remove any key containing sensitive patterns
        if (
          key.includes('networkCameras') ||
          key.includes('duckdns') ||
          key.includes('cloudStorage') ||
          key.includes('piEndpoint') ||
          key.includes('NotificationEmail')
        ) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`Cleared ${keysToRemove.length} sensitive storage entries`);
  } catch (e) {
    console.warn('Failed to scan localStorage for sensitive data:', e);
  }
};

/**
 * Get item from localStorage with error handling
 */
export const getStorageItem = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item) as T;
  } catch {
    return defaultValue;
  }
};

/**
 * Set item in localStorage with error handling
 */
export const setStorageItem = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`Failed to save ${key} to localStorage:`, e);
    return false;
  }
};

/**
 * Remove item from localStorage with error handling
 */
export const removeStorageItem = (key: string): boolean => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.warn(`Failed to remove ${key} from localStorage:`, e);
    return false;
  }
};

/**
 * Sanitize camera config for localStorage storage
 * SECURITY: Removes passwords before storing
 */
export interface SanitizedCameraConfig {
  name: string;
  url: string;
  username?: string;
  // NO password field - passwords must be stored in database
  id?: string;
}

export const sanitizeCameraConfigForStorage = (config: {
  name: string;
  url: string;
  username?: string;
  password?: string;
  id?: string;
}): SanitizedCameraConfig => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safeConfig } = config;
  return safeConfig;
};

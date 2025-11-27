import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect } from 'react';

export type StorageTier = '5GB' | '25GB' | '100GB';

interface StorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  cloudFiles: number;
  localFiles: number;
  cloudSizeBytes: number;
  localSizeBytes: number;
  percentageUsed: number;
  warningLevel: 'safe' | 'warning' | 'danger' | 'critical';
}

const STORAGE_TIERS: Record<StorageTier, number> = {
  '5GB': 5 * 1024 * 1024 * 1024,
  '25GB': 25 * 1024 * 1024 * 1024,
  '100GB': 100 * 1024 * 1024 * 1024,
};

export const useStorageStats = () => {
  const { user } = useAuth();
  const [storageTier, setStorageTier] = useState<StorageTier>(() => {
    try {
      const saved = localStorage.getItem('storageTier');
      return (saved as StorageTier) || '5GB';
    } catch {
      return '5GB';
    }
  });

  const updateStorageTier = (tier: StorageTier) => {
    setStorageTier(tier);
    try {
      localStorage.setItem('storageTier', tier);
    } catch (error) {
      console.error('Failed to save storage tier:', error);
    }
  };

  const storageLimitBytes = STORAGE_TIERS[storageTier];

  const getWarningLevel = (percentage: number): 'safe' | 'warning' | 'danger' | 'critical' => {
    if (percentage >= 95) return 'critical';
    if (percentage >= 85) return 'danger';
    if (percentage >= 70) return 'warning';
    return 'safe';
  };

  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ['storage-stats', user?.id, storageTier],
    queryFn: async (): Promise<StorageStats> => {
      if (!user) {
        return {
          totalFiles: 0,
          totalSizeBytes: 0,
          cloudFiles: 0,
          localFiles: 0,
          cloudSizeBytes: 0,
          localSizeBytes: 0,
          percentageUsed: 0,
          warningLevel: 'safe'
        };
      }

      const { data: recordings, error } = await supabase
        .from('recordings')
        .select('file_size, storage_type')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching storage stats:', error);
        throw error;
      }

      const cloudFiles = recordings?.filter(r => r.storage_type === 'cloud') || [];
      const localFiles = recordings?.filter(r => r.storage_type === 'local') || [];

      const cloudSizeBytes = cloudFiles.reduce((sum, r) => sum + (r.file_size || 0), 0);
      const localSizeBytes = localFiles.reduce((sum, r) => sum + (r.file_size || 0), 0);
      const totalSizeBytes = cloudSizeBytes + localSizeBytes;

      const percentageUsed = Math.min(100, Math.round((totalSizeBytes / storageLimitBytes) * 100));
      const warningLevel = getWarningLevel(percentageUsed);

      return {
        totalFiles: recordings?.length || 0,
        totalSizeBytes,
        cloudFiles: cloudFiles.length,
        localFiles: localFiles.length,
        cloudSizeBytes,
        localSizeBytes,
        percentageUsed,
        warningLevel
      };
    },
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return {
    stats: stats || {
      totalFiles: 0,
      totalSizeBytes: 0,
      cloudFiles: 0,
      localFiles: 0,
      cloudSizeBytes: 0,
      localSizeBytes: 0,
      percentageUsed: 0,
      warningLevel: 'safe'
    },
    isLoading,
    error,
    refetch,
    formatFileSize,
    storageTier,
    updateStorageTier,
    storageLimitBytes,
    storageLimitGB: parseInt(storageTier)
  };
};

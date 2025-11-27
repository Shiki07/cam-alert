import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface StorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  cloudFiles: number;
  localFiles: number;
  cloudSizeBytes: number;
  localSizeBytes: number;
  percentageUsed: number;
}

const STORAGE_LIMIT_GB = 5; // 5 GB default storage limit
const STORAGE_LIMIT_BYTES = STORAGE_LIMIT_GB * 1024 * 1024 * 1024;

export const useStorageStats = () => {
  const { user } = useAuth();

  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ['storage-stats', user?.id],
    queryFn: async (): Promise<StorageStats> => {
      if (!user) {
        return {
          totalFiles: 0,
          totalSizeBytes: 0,
          cloudFiles: 0,
          localFiles: 0,
          cloudSizeBytes: 0,
          localSizeBytes: 0,
          percentageUsed: 0
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

      const percentageUsed = Math.min(100, Math.round((totalSizeBytes / STORAGE_LIMIT_BYTES) * 100));

      return {
        totalFiles: recordings?.length || 0,
        totalSizeBytes,
        cloudFiles: cloudFiles.length,
        localFiles: localFiles.length,
        cloudSizeBytes,
        localSizeBytes,
        percentageUsed
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
      percentageUsed: 0
    },
    isLoading,
    error,
    refetch,
    formatFileSize,
    storageLimit: STORAGE_LIMIT_GB
  };
};

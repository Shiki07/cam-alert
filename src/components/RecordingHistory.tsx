
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Camera, Cloud, HardDrive, Download, Trash2, Eye, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const RecordingHistory = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: recordings, isLoading, refetch } = useQuery({
    queryKey: ['recordings', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const downloadFromCloud = async (recording: any) => {
    try {
      console.log('Downloading from cloud:', recording.file_path);
      
      const { data, error } = await supabase.storage
        .from('recordings')
        .download(recording.file_path);
      
      if (error) {
        console.error('Download error:', error);
        throw error;
      }
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = recording.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Download complete",
        description: `${recording.filename} downloaded successfully`
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not download file",
        variant: "destructive"
      });
    }
  };

  const viewInBrowser = async (recording: any) => {
    try {
      if (recording.storage_type !== 'cloud') {
        toast({
          title: "View not available",
          description: "Can only view cloud-stored files",
          variant: "destructive"
        });
        return;
      }

      const { data } = supabase.storage
        .from('recordings')
        .getPublicUrl(recording.file_path);

      if (data?.publicUrl) {
        window.open(data.publicUrl, '_blank');
      } else {
        // If bucket is private, get a signed URL
        const { data: signedData, error } = await supabase.storage
          .from('recordings')
          .createSignedUrl(recording.file_path, 3600); // 1 hour expiry
        
        if (error) throw error;
        
        if (signedData?.signedUrl) {
          window.open(signedData.signedUrl, '_blank');
        }
      }
    } catch (error) {
      console.error('View error:', error);
      toast({
        title: "View failed",
        description: "Could not open file for viewing",
        variant: "destructive"
      });
    }
  };

  const deleteRecording = async (recording: any) => {
    try {
      if (recording.storage_type === 'cloud') {
        console.log('Deleting from cloud storage:', recording.file_path);
        
        const { error: storageError } = await supabase.storage
          .from('recordings')
          .remove([recording.file_path]);
        
        if (storageError) {
          console.error('Storage deletion error:', storageError);
          throw storageError;
        }
      }
      
      const { error: dbError } = await supabase
        .from('recordings')
        .delete()
        .eq('id', recording.id);
      
      if (dbError) {
        console.error('Database deletion error:', dbError);
        throw dbError;
      }
      
      refetch();
      toast({
        title: "Recording deleted",
        description: "Recording removed successfully"
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not delete recording",
        variant: "destructive"
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStorageStats = () => {
    if (!recordings) return { totalFiles: 0, totalSize: 0, cloudFiles: 0, localFiles: 0 };
    
    return recordings.reduce((stats, recording) => {
      stats.totalFiles++;
      stats.totalSize += recording.file_size || 0;
      if (recording.storage_type === 'cloud') stats.cloudFiles++;
      else stats.localFiles++;
      return stats;
    }, { totalFiles: 0, totalSize: 0, cloudFiles: 0, localFiles: 0 });
  };

  if (isLoading) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <div className="text-gray-400">Loading recordings...</div>
        </CardContent>
      </Card>
    );
  }

  const stats = getStorageStats();

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <span>Recording History</span>
          <div className="text-sm text-gray-400 font-normal">
            {stats.totalFiles} files • {formatFileSize(stats.totalSize)}
          </div>
        </CardTitle>
        
        {/* Storage Statistics */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-700 rounded p-3">
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <Cloud className="w-4 h-4" />
              <span>Cloud Storage</span>
            </div>
            <div className="text-white font-semibold">{stats.cloudFiles} files</div>
          </div>
          <div className="bg-gray-700 rounded p-3">
            <div className="flex items-center gap-2 text-green-400 mb-1">
              <HardDrive className="w-4 h-4" />
              <span>Local Storage</span>
            </div>
            <div className="text-white font-semibold">{stats.localFiles} files</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {recordings?.length === 0 ? (
          <div className="text-center py-8">
            <Camera className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <div className="text-gray-400 mb-2">No recordings yet</div>
            <div className="text-gray-500 text-sm">
              Start recording or take snapshots to see your files here
            </div>
          </div>
        ) : (
          recordings?.map((recording) => (
            <div
              key={recording.id}
              className="bg-gray-700 rounded-lg p-4 flex items-center justify-between hover:bg-gray-650 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {recording.file_type === 'video' ? (
                    <Video className="w-5 h-5 text-blue-400" />
                  ) : (
                    <Camera className="w-5 h-5 text-green-400" />
                  )}
                  {recording.storage_type === 'cloud' ? (
                    <Cloud className="w-4 h-4 text-blue-300" />
                  ) : (
                    <HardDrive className="w-4 h-4 text-green-300" />
                  )}
                  {recording.motion_detected && (
                    <AlertCircle className="w-4 h-4 text-orange-400" title="Motion detected" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="text-white font-medium">{recording.filename}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(recording.recorded_at).toLocaleString()}
                    {recording.file_size && ` • ${formatFileSize(recording.file_size)}`}
                    {recording.motion_detected && ' • Motion detected'}
                    {recording.duration_seconds && ` • ${recording.duration_seconds}s`}
                  </div>
                  
                  <div className="text-xs text-gray-500 mt-1">
                    {recording.storage_type === 'cloud' ? 'Supabase Cloud Storage' : 'Local Download'}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {recording.storage_type === 'cloud' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => viewInBrowser(recording)}
                      className="border-gray-600 text-gray-300 hover:bg-gray-600"
                      title="View in browser"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadFromCloud(recording)}
                      className="border-gray-600 text-gray-300 hover:bg-gray-600"
                      title="Download file"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </>
                )}
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteRecording(recording)}
                  className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                  title="Delete recording"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};


import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Camera, HardDrive, Trash2, AlertCircle } from 'lucide-react';
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

  const deleteRecording = async (recording: any) => {
    try {
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
        description: "Recording metadata removed successfully"
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
    if (!recordings) return { totalFiles: 0, totalSize: 0 };
    
    return recordings.reduce((stats, recording) => {
      stats.totalFiles++;
      stats.totalSize += recording.file_size || 0;
      return stats;
    }, { totalFiles: 0, totalSize: 0 });
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
        <div className="bg-gray-700 rounded p-3">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <HardDrive className="w-4 h-4" />
            <span>Local Storage</span>
          </div>
          <div className="text-white font-semibold">{stats.totalFiles} files</div>
          <p className="text-xs text-gray-400 mt-1">
            Files are saved directly to your device
          </p>
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
                  <HardDrive className="w-4 h-4 text-green-300" />
                  {recording.motion_detected && (
                    <AlertCircle className="w-4 h-4 text-orange-400" />
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
                    Local Download
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteRecording(recording)}
                  className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                  aria-label="Delete recording"
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

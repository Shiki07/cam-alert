
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Video, Camera, Cloud, HardDrive, Download, Trash2 } from 'lucide-react';
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
      const { data, error } = await supabase.storage
        .from('recordings')
        .download(recording.file_path);
      
      if (error) throw error;
      
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
        description: "Could not download file",
        variant: "destructive"
      });
    }
  };

  const deleteRecording = async (recording: any) => {
    try {
      if (recording.storage_type === 'cloud') {
        const { error: storageError } = await supabase.storage
          .from('recordings')
          .remove([recording.file_path]);
        
        if (storageError) throw storageError;
      }
      
      const { error: dbError } = await supabase
        .from('recordings')
        .delete()
        .eq('id', recording.id);
      
      if (dbError) throw dbError;
      
      refetch();
      toast({
        title: "Recording deleted",
        description: "Recording removed successfully"
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Delete failed",
        description: "Could not delete recording",
        variant: "destructive"
      });
    }
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

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white">Recording History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recordings?.length === 0 ? (
          <div className="text-gray-400 text-center py-4">
            No recordings yet. Start recording to see your files here.
          </div>
        ) : (
          recordings?.map((recording) => (
            <div
              key={recording.id}
              className="bg-gray-700 rounded-lg p-4 flex items-center justify-between"
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
                </div>
                <div>
                  <div className="text-white font-medium">{recording.filename}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(recording.recorded_at).toLocaleString()} • 
                    {recording.file_size ? ` ${(recording.file_size / 1024 / 1024).toFixed(1)} MB` : ' Unknown size'}
                    {recording.motion_detected && ' • Motion detected'}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {recording.storage_type === 'cloud' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFromCloud(recording)}
                    className="border-gray-600 text-gray-300 hover:bg-gray-600"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteRecording(recording)}
                  className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
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

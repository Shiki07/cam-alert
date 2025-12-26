import React, { useEffect, useState } from 'react';
import { useStreamRelay } from '@/hooks/useStreamRelay';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { 
  Radio, 
  RadioTower, 
  Copy, 
  Check, 
  Smartphone,
  Monitor,
  RefreshCw,
  Eye
} from 'lucide-react';

interface StreamRelayControlsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isConnected: boolean;
}

export const StreamRelayControls: React.FC<StreamRelayControlsProps> = ({
  videoRef,
  isConnected,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const {
    isRelaying,
    relayRoomId,
    activeRooms,
    isLoadingRooms,
    startRelay,
    stopRelay,
    fetchActiveRooms,
  } = useStreamRelay({
    userId: user?.id,
    userName: user?.email?.split('@')[0] || 'Anonymous',
  });

  // Fetch active rooms on mount and periodically
  useEffect(() => {
    if (user?.id) {
      fetchActiveRooms();
      const interval = setInterval(fetchActiveRooms, 10000); // Refresh every 10s
      return () => clearInterval(interval);
    }
  }, [user?.id, fetchActiveRooms]);

  const handleToggleRelay = async () => {
    if (isRelaying) {
      await stopRelay();
      toast({
        title: "Stream stopped",
        description: "Your camera is no longer being shared",
      });
    } else if (videoRef.current) {
      const roomId = await startRelay(videoRef.current);
      if (roomId) {
        toast({
          title: "Stream started!",
          description: "Your camera is now being shared. Copy the link to view on your phone.",
        });
      }
    }
  };

  const shareableLink = relayRoomId 
    ? `${window.location.origin}/view/${relayRoomId}` 
    : null;

  const handleCopyLink = async () => {
    if (shareableLink) {
      await navigator.clipboard.writeText(shareableLink);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "Open this link on your phone to view the stream",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <RadioTower className="h-5 w-5 text-primary" />
          Stream to Phone
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Computer</span>
            {isConnected ? (
              <Badge variant="default" className="bg-green-600 text-xs">Connected</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Disconnected</Badge>
            )}
          </div>
          <span className="text-muted-foreground">→</span>
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Phone</span>
          </div>
        </div>

        {/* Toggle relay button */}
        <Button
          onClick={handleToggleRelay}
          disabled={!isConnected}
          variant={isRelaying ? "destructive" : "default"}
          className="w-full"
        >
          {isRelaying ? (
            <>
              <Radio className="h-4 w-4 mr-2 animate-pulse" />
              Stop Sharing
            </>
          ) : (
            <>
              <RadioTower className="h-4 w-4 mr-2" />
              Share to Phone
            </>
          )}
        </Button>

        {/* Shareable link */}
        {shareableLink && (
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              Share this link with your phone:
            </label>
            <div className="flex gap-2">
              <Input
                value={shareableLink}
                readOnly
                className="text-xs font-mono bg-muted"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Open this link on your phone's browser to view the camera feed
            </p>
          </div>
        )}

        {/* Active streams info */}
        {activeRooms.length > 0 && !isRelaying && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Active streams:</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={fetchActiveRooms}
                disabled={isLoadingRooms}
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingRooms ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {activeRooms.map((room) => (
              <div 
                key={room.roomId}
                className="flex items-center justify-between p-2 bg-muted rounded text-sm"
              >
                <span className="truncate flex-1">{room.hostName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`/view/${room.roomId}`, '_blank')}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Status indicator when relaying */}
        {isRelaying && (
          <div className="flex items-center justify-center gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-sm text-green-500 font-medium">
              Streaming live at ~10 fps
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

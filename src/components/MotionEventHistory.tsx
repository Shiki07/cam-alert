import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Clock, Mail, Video, RefreshCw } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface MotionEvent {
  id: string;
  motion_level: number;
  duration_ms: number | null;
  detected_at: string;
  cleared_at: string | null;
  recording_triggered: boolean;
  email_sent: boolean;
  detection_zone: string | null;
}

export const MotionEventHistory = () => {
  const [motionEvents, setMotionEvents] = useState<MotionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalEventsToday, setTotalEventsToday] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();

  const loadMotionEvents = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      // Get events from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('motion_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('detected_at', sevenDaysAgo.toISOString())
        .order('detected_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading motion events:', error);
        toast({
          title: "Error loading motion events",
          description: "Could not fetch motion detection history",
          variant: "destructive"
        });
        return;
      }

      setMotionEvents(data || []);
      
      // Count today's events
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEvents = data?.filter(event => 
        new Date(event.detected_at) >= today
      ).length || 0;
      setTotalEventsToday(todayEvents);

    } catch (error) {
      console.error('Error in loadMotionEvents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMotionEvents();
  }, [user]);

  const formatDuration = (durationMs: number | null) => {
    if (!durationMs) return 'Ongoing';
    const seconds = Math.round(durationMs / 1000);
    return `${seconds}s`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMotionLevelColor = (level: number) => {
    if (level < 1) return 'bg-green-500';
    if (level < 3) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Motion Events
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-muted-foreground">
              {totalEventsToday} today
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMotionEvents}
              disabled={isLoading}
              title="Refresh motion events"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-64 w-full">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading motion events...
            </div>
          ) : motionEvents.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No motion events recorded
            </div>
          ) : (
            <div className="space-y-3">
              {motionEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${getMotionLevelColor(event.motion_level)}`}
                    />
                    <div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-3 h-3" />
                        <span className="font-medium">
                          {formatTime(event.detected_at)}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {event.motion_level.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Duration: {formatDuration(event.duration_ms)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    {event.recording_triggered && (
                      <Video className="w-4 h-4 text-blue-400" />
                    )}
                    {event.email_sent && (
                      <Mail className="w-4 h-4 text-green-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
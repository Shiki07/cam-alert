import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Activity, Clock } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface MotionStats {
  totalEvents: number;
  averageMotionLevel: number;
  totalDuration: number;
  peakHour: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

export const MotionAnalytics = () => {
  const [stats, setStats] = useState<MotionStats>({
    totalEvents: 0,
    averageMotionLevel: 0,
    totalDuration: 0,
    peakHour: 0,
    trend: 'stable',
    trendPercentage: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const loadMotionStats = async () => {
      if (!user) return;

      try {
        setIsLoading(true);
        
        // Get events from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: events, error } = await supabase
          .from('motion_events')
          .select('*')
          .eq('user_id', user.id)
          .gte('detected_at', thirtyDaysAgo.toISOString())
          .not('cleared_at', 'is', null);

        if (error) {
          console.error('Error loading motion stats:', error);
          return;
        }

        if (!events || events.length === 0) {
          setIsLoading(false);
          return;
        }

        // Calculate statistics
        const totalEvents = events.length;
        const averageMotionLevel = events.reduce((sum, event) => sum + event.motion_level, 0) / totalEvents;
        const totalDuration = events.reduce((sum, event) => sum + (event.duration_ms || 0), 0);

        // Find peak hour
        const hourCounts = new Array(24).fill(0);
        events.forEach(event => {
          const hour = new Date(event.detected_at).getHours();
          hourCounts[hour]++;
        });
        const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

        // Calculate trend (compare last 15 days to previous 15 days)
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        
        const recentEvents = events.filter(event => new Date(event.detected_at) >= fifteenDaysAgo);
        const olderEvents = events.filter(event => new Date(event.detected_at) < fifteenDaysAgo);
        
        let trend: 'up' | 'down' | 'stable' = 'stable';
        let trendPercentage = 0;
        
        if (olderEvents.length > 0) {
          const recentAvg = recentEvents.length / 15;
          const olderAvg = olderEvents.length / 15;
          const change = ((recentAvg - olderAvg) / olderAvg) * 100;
          
          if (Math.abs(change) > 10) {
            trend = change > 0 ? 'up' : 'down';
            trendPercentage = Math.abs(change);
          }
        }

        setStats({
          totalEvents,
          averageMotionLevel,
          totalDuration,
          peakHour,
          trend,
          trendPercentage
        });

      } catch (error) {
        console.error('Error in loadMotionStats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMotionStats();
  }, [user]);

  const formatDuration = (totalMs: number) => {
    const totalSeconds = Math.round(totalMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Motion Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            Loading analytics...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Motion Analytics (30 days)
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Events</span>
              <div className="flex items-center gap-1">
                <span className="font-semibold">{stats.totalEvents}</span>
                {stats.trend !== 'stable' && (
                  <div className="flex items-center gap-1">
                    {stats.trend === 'up' ? (
                      <TrendingUp className="w-3 h-3 text-red-400" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-green-400" />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {stats.trendPercentage.toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Avg Motion Level</span>
              <Badge variant="outline">
                {stats.averageMotionLevel.toFixed(1)}%
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Duration</span>
              <span className="font-semibold text-sm">
                {formatDuration(stats.totalDuration)}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Peak Hour</span>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span className="font-semibold text-sm">
                  {formatHour(stats.peakHour)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
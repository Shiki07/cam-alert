import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const EDGE_FUNCTION_URL = 'https://mlrouwmtqdrlbwhacmic.supabase.co/functions/v1/stream-relay';
const FRAME_INTERVAL = 100; // ~10 fps for balance between smoothness and bandwidth

interface UseStreamRelayProps {
  userId?: string;
  userName?: string;
}

interface ActiveRoom {
  roomId: string;
  hostId: string;
  hostName: string;
  createdAt: string;
}

// Helper to get auth token
const getAuthToken = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
};

export const useStreamRelay = ({ userId, userName }: UseStreamRelayProps) => {
  const [isRelaying, setIsRelaying] = useState(false);
  const [relayRoomId, setRelayRoomId] = useState<string | null>(null);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pushIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const relayRoomIdRef = useRef<string | null>(null);
  const isRelayingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    relayRoomIdRef.current = relayRoomId;
  }, [relayRoomId]);

  useEffect(() => {
    isRelayingRef.current = isRelaying;
  }, [isRelaying]);

  // Capture frame from video element (optimized: 320x240 @ 50% JPEG quality)
  const captureFrame = useCallback((): string | null => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video || video.readyState < 2) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fixed smaller resolution for faster relay
    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(video, 0, 0, 320, 240);
    return canvas.toDataURL('image/jpeg', 0.5); // 50% quality
  }, []);

  // Push frame to relay server with authentication
  const pushFrame = useCallback(async () => {
    const currentRoomId = relayRoomIdRef.current;
    if (!currentRoomId || !isRelayingRef.current || !userId) return;

    const frame = captureFrame();
    if (!frame) return;

    try {
      const token = await getAuthToken();
      if (!token) {
        console.error('No auth token available for push');
        return;
      }

      const response = await fetch(`${EDGE_FUNCTION_URL}?action=push&roomId=${encodeURIComponent(currentRoomId)}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          frame,
          hostName: userName || 'Anonymous',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Push frame error:', error);
      }
    } catch (error) {
      console.error('Push frame error:', error);
    }
  }, [captureFrame, userId, userName]);

  // Start relaying
  const startRelay = useCallback(async (video: HTMLVideoElement) => {
    if (isRelayingRef.current || !userId) {
      console.log('Cannot start relay: already relaying or no user ID');
      return null;
    }
    
    // Verify authentication before starting
    const token = await getAuthToken();
    if (!token) {
      console.error('Cannot start relay: not authenticated');
      setRelayError('Authentication required');
      return null;
    }
    
    console.log('Starting webcam relay...');
    
    videoRef.current = video;
    canvasRef.current = document.createElement('canvas');
    
    // Generate unique room ID
    const newRoomId = `room_${userId}_${Date.now()}`;
    
    // Set refs first
    relayRoomIdRef.current = newRoomId;
    isRelayingRef.current = true;
    
    // Update state
    setRelayRoomId(newRoomId);
    setIsRelaying(true);
    setRelayError(null);
    
    // Clear any existing interval
    if (pushIntervalRef.current) clearInterval(pushIntervalRef.current);
    
    // Start pushing frames
    pushIntervalRef.current = setInterval(pushFrame, FRAME_INTERVAL);
    
    // Push first frame immediately
    setTimeout(pushFrame, 100);
    
    console.log('Relay started with room ID:', newRoomId);
    return newRoomId;
  }, [userId, pushFrame]);

  // Stop relay with authentication
  const stopRelay = useCallback(async () => {
    console.log('Stopping relay...');
    
    // Clear interval
    if (pushIntervalRef.current) {
      clearInterval(pushIntervalRef.current);
      pushIntervalRef.current = null;
    }
    
    const currentRoomId = relayRoomIdRef.current;
    
    // Notify relay server to delete the room
    if (isRelayingRef.current && currentRoomId) {
      try {
        const token = await getAuthToken();
        await fetch(`${EDGE_FUNCTION_URL}?action=stop&roomId=${encodeURIComponent(currentRoomId)}`, {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
      } catch (err) {
        console.error('Failed to stop relay:', err);
      }
    }
    
    isRelayingRef.current = false;
    relayRoomIdRef.current = null;
    setIsRelaying(false);
    setRelayRoomId(null);
    videoRef.current = null;
    canvasRef.current = null;
  }, []);

  // Fetch active rooms for the current user with authentication
  const fetchActiveRooms = useCallback(async () => {
    if (!userId) {
      setActiveRooms([]);
      return;
    }

    setIsLoadingRooms(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        console.error('No auth token for fetching rooms');
        setActiveRooms([]);
        return;
      }

      const response = await fetch(`${EDGE_FUNCTION_URL}?action=list-rooms`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setActiveRooms(data.rooms || []);
      } else {
        console.error('Failed to fetch rooms');
        setActiveRooms([]);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setActiveRooms([]);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pushIntervalRef.current) clearInterval(pushIntervalRef.current);
    };
  }, []);

  return {
    isRelaying,
    relayRoomId,
    relayError,
    activeRooms,
    isLoadingRooms,
    startRelay,
    stopRelay,
    fetchActiveRooms,
  };
};

// Hook for viewing a relay stream
interface UseStreamViewerProps {
  roomId: string | null;
  enabled?: boolean;
}

type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'ended';

export const useStreamViewer = ({ roomId, enabled = true }: UseStreamViewerProps) => {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [hostName, setHostName] = useState<string>('');
  const [lastFrameTime, setLastFrameTime] = useState(Date.now());

  const pullIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Pull is public - no authentication required for viewing shared streams
  const pullFrame = useCallback(async () => {
    if (!roomId) return;

    try {
      const response = await fetch(
        `${EDGE_FUNCTION_URL}?action=pull&roomId=${encodeURIComponent(roomId)}`
      );
      
      if (response.status === 404) {
        setStatus('ended');
        return;
      }
      
      if (response.status === 410) {
        setStatus('error'); // Stale stream
        return;
      }

      if (!response.ok) return;

      const data = await response.json();
      if (data.frame) {
        setFrameUrl(data.frame);
        setHostName(data.hostName || '');
        setStatus('streaming');
        setLastFrameTime(Date.now());
      }
    } catch (error) {
      console.error('Pull frame error:', error);
      setStatus('error');
    }
  }, [roomId]);

  // Start/stop pulling based on roomId and enabled state
  useEffect(() => {
    if (!roomId || !enabled) {
      if (pullIntervalRef.current) {
        clearInterval(pullIntervalRef.current);
        pullIntervalRef.current = null;
      }
      setStatus('idle');
      setFrameUrl(null);
      return;
    }

    setStatus('connecting');
    pullFrame(); // Initial pull

    pullIntervalRef.current = setInterval(pullFrame, 100); // ~10 fps

    return () => {
      if (pullIntervalRef.current) {
        clearInterval(pullIntervalRef.current);
        pullIntervalRef.current = null;
      }
    };
  }, [roomId, enabled, pullFrame]);

  // Check for stale stream
  useEffect(() => {
    if (status !== 'streaming') return;

    const staleCheck = setInterval(() => {
      if (Date.now() - lastFrameTime > 5000) {
        setStatus('error');
      }
    }, 1000);

    return () => clearInterval(staleCheck);
  }, [status, lastFrameTime]);

  return {
    frameUrl,
    status,
    hostName,
    lastFrameTime,
  };
};

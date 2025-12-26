import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const roomId = url.searchParams.get('roomId');

  console.log(`Stream relay action: ${action}, roomId: ${roomId}`);

  // Create Supabase client with service role for database operations
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ==========================================
    // ACTION: list-rooms
    // Lists all active rooms for a specific user (updated within 30 seconds)
    // ==========================================
    if (action === 'list-rooms') {
      const hostId = url.searchParams.get('hostId');
      
      if (!hostId) {
        return new Response(JSON.stringify({ error: 'hostId required for list-rooms' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      
      const { data: rooms, error } = await supabase
        .from('relay_frames')
        .select('room_id, host_id, host_name, updated_at')
        .eq('host_id', hostId)
        .gte('updated_at', thirtySecondsAgo);

      if (error) throw error;

      const formattedRooms = (rooms || []).map(r => ({
        roomId: r.room_id,
        hostId: r.host_id,
        hostName: r.host_name,
        createdAt: r.updated_at,
      }));

      console.log(`Found ${formattedRooms.length} active rooms for user ${hostId}`);

      return new Response(JSON.stringify({ rooms: formattedRooms }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // ACTION: push
    // Host sends a frame (POST request)
    // ==========================================
    if (action === 'push' && req.method === 'POST') {
      if (!roomId) {
        return new Response(JSON.stringify({ error: 'roomId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const body = await req.json();
      const { frame, hostId, hostName } = body;

      if (!frame) {
        return new Response(JSON.stringify({ error: 'frame required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!hostId) {
        return new Response(JSON.stringify({ error: 'hostId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Upsert frame to database (insert or update if room exists)
      const { error } = await supabase
        .from('relay_frames')
        .upsert({
          room_id: roomId,
          frame: frame,
          host_id: hostId,
          host_name: hostName || 'Anonymous',
          updated_at: new Date().toISOString(),
        }, { 
          onConflict: 'room_id' 
        });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // ACTION: pull
    // Viewer fetches the latest frame (GET request)
    // ==========================================
    if (action === 'pull') {
      if (!roomId) {
        return new Response(JSON.stringify({ error: 'roomId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('relay_frames')
        .select('frame, host_name, updated_at')
        .eq('room_id', roomId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return new Response(JSON.stringify({ error: 'Stream not found or ended' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if stream is stale (older than 10 seconds)
      const age = Date.now() - new Date(data.updated_at).getTime();
      if (age > 10000) {
        return new Response(JSON.stringify({ 
          error: 'Stream stale', 
          lastUpdate: data.updated_at,
          age 
        }), {
          status: 410, // HTTP 410 Gone
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        frame: data.frame, 
        timestamp: new Date(data.updated_at).getTime(),
        hostName: data.host_name,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // ACTION: stop
    // Host stops the stream (deletes the room)
    // ==========================================
    if (action === 'stop') {
      if (!roomId) {
        return new Response(JSON.stringify({ error: 'roomId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase
        .from('relay_frames')
        .delete()
        .eq('room_id', roomId);

      if (error) throw error;

      console.log(`Stopped stream for room: ${roomId}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // ACTION: cleanup
    // Remove stale frames (older than 60 seconds)
    // ==========================================
    if (action === 'cleanup') {
      const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
      
      const { error } = await supabase
        .from('relay_frames')
        .delete()
        .lt('updated_at', sixtySecondsAgo);

      if (error) throw error;

      console.log('Cleaned up stale streams');

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Stream relay error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

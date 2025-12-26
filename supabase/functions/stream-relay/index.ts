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

  console.log(`Stream relay action: ${action}`);

  // Create Supabase clients
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  // Service client for database operations
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  // Anon client for auth verification
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

  // ==========================================
  // AUTHENTICATION REQUIRED FOR ALL ACTIONS EXCEPT PULL
  // ==========================================
  const authHeader = req.headers.get('authorization');
  const tokenParam = url.searchParams.get('token');
  
  let jwt: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    jwt = authHeader.replace('Bearer ', '');
  } else if (tokenParam) {
    jwt = tokenParam;
  }

  // Verify JWT for actions that modify data
  let authenticatedUserId: string | null = null;
  
  if (action !== 'pull') {
    // push, stop, list-rooms, cleanup all require authentication
    if (!jwt) {
      console.warn('Stream relay: No authentication token provided');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(jwt);
    
    if (authError || !user) {
      console.warn('Stream relay: Invalid or expired token');
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    authenticatedUserId = user.id;
    console.log(`Stream relay: Authenticated user ${user.id.substring(0, 8)}...`);
  }

  try {
    // ==========================================
    // ACTION: list-rooms
    // Lists all active rooms for the authenticated user
    // ==========================================
    if (action === 'list-rooms') {
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      
      const { data: rooms, error } = await supabaseAdmin
        .from('relay_frames')
        .select('room_id, host_id, host_name, updated_at')
        .eq('host_id', authenticatedUserId)
        .gte('updated_at', thirtySecondsAgo);

      if (error) throw error;

      const formattedRooms = (rooms || []).map(r => ({
        roomId: r.room_id,
        hostId: r.host_id,
        hostName: r.host_name,
        createdAt: r.updated_at,
      }));

      console.log(`Found ${formattedRooms.length} active rooms`);

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
      const { frame, hostName } = body;

      if (!frame) {
        return new Response(JSON.stringify({ error: 'frame required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // SECURITY: Use authenticated user ID, not from request body
      const { error } = await supabaseAdmin
        .from('relay_frames')
        .upsert({
          room_id: roomId,
          frame: frame,
          host_id: authenticatedUserId,
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
    // PUBLIC: No authentication required for viewing shared streams
    // ==========================================
    if (action === 'pull') {
      if (!roomId) {
        return new Response(JSON.stringify({ error: 'roomId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabaseAdmin
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

      // SECURITY: Only allow deleting rooms owned by the authenticated user
      const { error } = await supabaseAdmin
        .from('relay_frames')
        .delete()
        .eq('room_id', roomId)
        .eq('host_id', authenticatedUserId);

      if (error) throw error;

      console.log(`Stopped stream for room`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // ACTION: cleanup
    // Remove stale frames (only for authenticated user's streams)
    // ==========================================
    if (action === 'cleanup') {
      const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
      
      // Only cleanup the authenticated user's stale streams
      const { error } = await supabaseAdmin
        .from('relay_frames')
        .delete()
        .eq('host_id', authenticatedUserId)
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

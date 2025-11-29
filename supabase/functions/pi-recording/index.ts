import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`Pi recording: Processing request for user ${user.id}`);

    const { action, pi_url, recording_id, stream_url, quality, motion_triggered, video_path } = await req.json();

    if (!action || !pi_url) {
      throw new Error('Missing required parameters: action and pi_url');
    }

    console.log(`Pi recording: Action=${action}, Pi URL=${pi_url}`);

    // Route to appropriate action
    switch (action) {
      case 'start':
        return await startRecording(pi_url, recording_id, stream_url, quality, motion_triggered, video_path, user.id);
      
      case 'stop':
        return await stopRecording(pi_url, recording_id, user.id);
      
      case 'status':
        return await getStatus(pi_url, recording_id);
      
      case 'list_active':
        return await listActive(pi_url);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Pi recording error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function startRecording(
  piUrl: string, 
  recordingId: string, 
  streamUrl: string, 
  quality: string, 
  motionTriggered: boolean,
  videoPath: string | undefined,
  userId: string
): Promise<Response> {
  console.log(`Starting recording ${recordingId} on Pi at ${piUrl}`);
  console.log(`Video path: ${videoPath || 'default'}`);
  
  // Add timeout controller - 30 seconds should be enough for Pi to respond
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(`${piUrl}/recording/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recording_id: recordingId,
        stream_url: streamUrl,
        quality,
        motion_triggered: motionTriggered,
        video_path: videoPath
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pi recording start failed (${response.status}): ${error}`);
    }

    const result = await response.json();
    console.log('Recording started on Pi:', result);

  // Save initial metadata to Supabase
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error: dbError } = await supabase
    .from('recordings')
    .insert({
      id: recordingId,
      user_id: userId,
      filename: result.filename,
      file_type: 'video',
      storage_type: 'local',
      file_path: `/pi/${result.filename}`,
      motion_detected: motionTriggered,
      pi_sync_status: 'recording'
    });

  if (dbError) {
    console.error('Database error:', dbError);
    // Don't fail the request if DB insert fails - recording is still active
  }

  return new Response(
    JSON.stringify({ success: true, ...result }),
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.error('Pi recording start timed out after 30 seconds');
      throw new Error('Pi service timeout - check if Pi recording service is responding');
    }
    
    throw error;
  }
}

async function stopRecording(piUrl: string, recordingId: string, userId: string): Promise<Response> {
  console.log(`Stopping recording ${recordingId} on Pi at ${piUrl}`);
  
  const response = await fetch(`${piUrl}/recording/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recording_id: recordingId })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pi recording stop failed: ${error}`);
  }

  const result = await response.json();
  console.log('Recording stopped:', result);

  // Update metadata in Supabase
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error: dbError } = await supabase
    .from('recordings')
    .update({
      file_size: result.file_size,
      duration_seconds: result.duration_seconds,
      pi_sync_status: 'completed',
      pi_synced_at: new Date().toISOString()
    })
    .eq('id', recordingId)
    .eq('user_id', userId);

  if (dbError) {
    console.error('Database update error:', dbError);
  }

  return new Response(
    JSON.stringify({ success: true, ...result }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getStatus(piUrl: string, recordingId: string): Promise<Response> {
  console.log(`Getting status for recording ${recordingId} from Pi at ${piUrl}`);
  
  const response = await fetch(`${piUrl}/recording/status/${recordingId}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pi status check failed: ${error}`);
  }

  const result = await response.json();
  
  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function listActive(piUrl: string): Promise<Response> {
  console.log(`Listing active recordings from Pi at ${piUrl}`);
  
  const response = await fetch(`${piUrl}/recording/active`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pi list active failed: ${error}`);
  }

  const result = await response.json();
  
  return new Response(
    JSON.stringify(result),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
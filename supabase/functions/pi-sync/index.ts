import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PiSyncRequest {
  recording_id: string;
  pi_endpoint: string; // Your Pi's local IP + port (e.g., "http://192.168.1.100:3001")
}

const handler = async (req: Request): Promise<Response> => {
  console.log('Pi sync function called');

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the JWT token
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { recording_id, pi_endpoint }: PiSyncRequest = await req.json();

    console.log(`Processing Pi sync for recording: ${recording_id}`);

    // Get recording details
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recording_id)
      .eq('user_id', user.id)
      .single();

    if (recordingError || !recording) {
      return new Response(
        JSON.stringify({ error: 'Recording not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('recordings')
      .download(recording.file_path);

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError);
      
      // Update sync status to failed
      await supabase
        .from('recordings')
        .update({ 
          pi_sync_status: 'failed',
          pi_sync_error: `Download failed: ${downloadError?.message}`
        })
        .eq('id', recording_id);

      return new Response(
        JSON.stringify({ error: 'Failed to download recording' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Convert blob to array buffer
    const arrayBuffer = await fileData.arrayBuffer();
    
    // Send file to Raspberry Pi
    const formData = new FormData();
    formData.append('file', new Blob([arrayBuffer]), recording.filename);
    formData.append('recording_id', recording_id);
    formData.append('recorded_at', recording.recorded_at);
    formData.append('motion_detected', recording.motion_detected.toString());

    console.log(`Sending file to Pi endpoint: ${pi_endpoint}/upload`);

    const piResponse = await fetch(`${pi_endpoint}/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${jwt}` // Pass auth to Pi service
      }
    });

    if (!piResponse.ok) {
      const errorText = await piResponse.text();
      console.error('Pi upload failed:', errorText);
      
      // Update sync status to failed
      await supabase
        .from('recordings')
        .update({ 
          pi_sync_status: 'failed',
          pi_sync_error: `Pi upload failed: ${errorText}`
        })
        .eq('id', recording_id);

      return new Response(
        JSON.stringify({ error: 'Failed to upload to Pi' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Update sync status to completed
    await supabase
      .from('recordings')
      .update({ 
        pi_sync_status: 'completed',
        pi_sync_error: null,
        pi_synced_at: new Date().toISOString()
      })
      .eq('id', recording_id);

    console.log(`Pi sync completed for recording: ${recording_id}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Recording synced to Pi successfully'
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in Pi sync:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
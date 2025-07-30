import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PiHealthCheckRequest {
  pi_endpoint: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify user authentication
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { pi_endpoint }: PiHealthCheckRequest = await req.json();

    if (!pi_endpoint) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Pi endpoint is required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Pi health check: Testing connectivity to ${pi_endpoint} for user ${user.id}`);

    // Ensure we use HTTP for local connections
    const endpoint = pi_endpoint.startsWith('https://') 
      ? pi_endpoint.replace('https://', 'http://') 
      : pi_endpoint;

    // Test Pi service health endpoint
    const healthUrl = `${endpoint}/health`;
    console.log(`Pi health check: Making request to ${healthUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Supabase-Pi-Health-Check/1.0',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const responseData = await response.text();
        console.log(`Pi health check: Success - Status ${response.status}`);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Pi service is running (Status: ${response.status})`,
            status: response.status,
            response: responseData
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      } else {
        console.log(`Pi health check: Failed - Status ${response.status}`);
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: `Pi service returned status ${response.status}`,
            status: response.status
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('Pi health check: Timeout after 10 seconds');
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'Connection timeout (10s) - Pi service may be unreachable'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.error('Pi health check: Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Connection failed: ${fetchError.message}`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('Pi health check: Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Internal server error',
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
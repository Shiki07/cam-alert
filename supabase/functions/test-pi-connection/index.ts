import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestRequest {
  pi_endpoint: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pi_endpoint }: TestRequest = await req.json();

    if (!pi_endpoint) {
      return new Response(
        JSON.stringify({ error: 'Pi endpoint is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Normalize the endpoint URL
    const normalizedEndpoint = pi_endpoint.endsWith('/') 
      ? pi_endpoint.slice(0, -1) 
      : pi_endpoint;

    console.log(`Testing Pi connection to: ${normalizedEndpoint}/health`);

    // Test the Pi health endpoint from the cloud
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(`${normalizedEndpoint}/health`, {
        method: 'GET',
        headers: {
          'User-Agent': 'CamAlert-Cloud-Test/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: `Pi service returned ${response.status}: ${response.statusText}`,
            reachable: true, // It's reachable but returned an error
            statusCode: response.status
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const healthData = await response.json();
      
      return new Response(
        JSON.stringify({ 
          success: true,
          reachable: true,
          healthData,
          message: 'Pi service is reachable and responding correctly'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      let errorMessage = 'Unknown connection error';
      let reachable = false;

      if (fetchError.name === 'AbortError') {
        errorMessage = 'Connection timeout (10 seconds) - Port 3002 may not be forwarded or Pi service not running';
      } else if (fetchError.message.includes('fetch')) {
        errorMessage = 'Cannot reach Pi service on port 3002 - Verify: 1) Port 3002 is forwarded in router, 2) Pi service is running (npm start in pi-service folder), 3) Firewall allows port 3002';
      } else {
        errorMessage = fetchError.message || 'Connection failed';
      }

      return new Response(
        JSON.stringify({ 
          success: false,
          reachable,
          error: errorMessage,
          details: fetchError.message
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error: any) {
    console.error("Error in Pi connection test:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Server error during connection test'
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
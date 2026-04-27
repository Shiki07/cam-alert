import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestRequest {
  pi_endpoint: string;
}

// Block SSRF to loopback/metadata/link-local ranges
const isBlockedHost = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  // IPv4 loopback / metadata / link-local
  if (/^127\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // includes AWS/GCP metadata 169.254.169.254
  if (/^0\./.test(h)) return true;
  // IPv6 loopback / link-local / unique-local
  if (/^\[?(::1|fe80:|fc|fd)/i.test(h)) return true;
  return false;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated caller
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { pi_endpoint }: TestRequest = await req.json();

    if (!pi_endpoint || typeof pi_endpoint !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Pi endpoint is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL
    let parsed: URL;
    try {
      parsed = new URL(pi_endpoint);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return new Response(
        JSON.stringify({ error: 'Only http(s) protocols allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (isBlockedHost(parsed.hostname)) {
      return new Response(
        JSON.stringify({ error: 'Endpoint host is not permitted' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEndpoint = pi_endpoint.endsWith('/')
      ? pi_endpoint.slice(0, -1)
      : pi_endpoint;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${normalizedEndpoint}/health`, {
        method: 'GET',
        headers: { 'User-Agent': 'CamAlert-Cloud-Test/1.0' },
        redirect: 'manual',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Pi service returned ${response.status}`,
            reachable: true,
            statusCode: response.status
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let healthData: unknown = null;
      try { healthData = await response.json(); } catch { healthData = null; }

      return new Response(
        JSON.stringify({
          success: true,
          reachable: true,
          healthData,
          message: 'Pi service is reachable and responding correctly'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      let errorMessage = 'Connection failed';
      if (fetchError?.name === 'AbortError') {
        errorMessage = 'Connection timeout (12 seconds) - Pi service may not be reachable';
      } else if (typeof fetchError?.message === 'string' && fetchError.message.includes('fetch')) {
        errorMessage = 'Cannot reach Pi service - verify port forwarding, that the service is running, and firewall rules';
      }

      return new Response(
        JSON.stringify({
          success: false,
          reachable: false,
          error: errorMessage
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    console.error("Error in Pi connection test:", error?.message || 'unknown');
    return new Response(
      JSON.stringify({ success: false, error: 'Server error during connection test' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);


import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { domain, token, ip } = await req.json();

    if (!domain || !token || !ip) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: domain, token, or ip' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Clean domain name (remove .duckdns.org if present)
    const cleanDomain = domain.replace('.duckdns.org', '').replace('http://', '').replace('https://', '');
    
    // Make request to DuckDNS
    const duckdnsUrl = `https://www.duckdns.org/update?domains=${cleanDomain}&token=${token}&ip=${ip}`;
    
    console.log(`Updating DuckDNS - Domain: ${cleanDomain}, IP: ${ip}`);
    
    const response = await fetch(duckdnsUrl);
    const result = await response.text();
    
    console.log(`DuckDNS response: ${result}`);
    
    if (result.trim() === 'OK') {
      return new Response(
        JSON.stringify({ success: true, message: 'DuckDNS updated successfully' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } else {
      return new Response(
        JSON.stringify({ error: `DuckDNS update failed: ${result}` }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  } catch (error) {
    console.error('DuckDNS update error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

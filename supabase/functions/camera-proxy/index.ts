
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response('Missing url parameter', { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    console.log('Proxying request to:', targetUrl);

    // Fetch the stream from the Raspberry Pi
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Camera-Proxy/1.0',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch from target:', response.status, response.statusText);
      return new Response(`Failed to fetch stream: ${response.statusText}`, {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // Forward the response with CORS headers
    const headers = new Headers(corsHeaders);
    
    // Copy important headers from the original response
    const contentType = response.headers.get('content-type');
    if (contentType) {
      headers.set('content-type', contentType);
    }
    
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) {
      headers.set('cache-control', cacheControl);
    }

    // For MJPEG streams, we need to handle the multipart response
    if (contentType?.includes('multipart')) {
      console.log('Handling MJPEG multipart stream');
      
      return new Response(response.body, {
        status: response.status,
        headers: headers,
      });
    }

    // For regular responses
    return new Response(response.body, {
      status: response.status,
      headers: headers,
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(`Proxy error: ${error.message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let targetUrl: string;
    let method = 'GET';

    if (req.method === 'GET') {
      // Handle GET requests with URL parameter (for streaming)
      const url = new URL(req.url);
      const urlParam = url.searchParams.get('url');
      if (!urlParam) {
        return new Response('Missing url parameter', { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      targetUrl = urlParam;
    } else if (req.method === 'POST') {
      // Handle POST requests with JSON body
      const body = await req.json();
      if (!body.url) {
        return new Response('Missing url in request body', { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      targetUrl = body.url;
      method = body.method || 'GET';
    } else {
      return new Response('Method not allowed', { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    console.log('Proxying request to:', targetUrl, 'with method:', method);

    // Fetch the stream from the camera
    const response = await fetch(targetUrl, {
      method: method,
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

    // For HEAD requests, just return the status
    if (method === 'HEAD') {
      return new Response(null, {
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

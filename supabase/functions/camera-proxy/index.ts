
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
        console.error('Missing url parameter in GET request');
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
        console.error('Missing url in POST request body');
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

    console.log(`Proxying ${method} request to:`, targetUrl);

    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      // Fetch the stream from the camera
      const response = await fetch(targetUrl, {
        method: method,
        headers: {
          'User-Agent': 'Camera-Proxy/1.0',
          'Accept': '*/*',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`Failed to fetch from target: ${response.status} ${response.statusText}`);
        console.error('Response headers:', Object.fromEntries(response.headers.entries()));
        
        return new Response(`Camera connection failed: ${response.status} ${response.statusText}`, {
          status: response.status,
          headers: corsHeaders,
        });
      }

      console.log(`Successfully connected to camera. Status: ${response.status}`);
      console.log('Response content-type:', response.headers.get('content-type'));

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
        console.log('Forwarding content-type:', contentType);
      }
      
      const cacheControl = response.headers.get('cache-control');
      if (cacheControl) {
        headers.set('cache-control', cacheControl);
      }

      // For MJPEG streams, we need to handle the multipart response
      if (contentType?.includes('multipart') || contentType?.includes('mjpeg')) {
        console.log('Handling MJPEG multipart stream');
        
        return new Response(response.body, {
          status: response.status,
          headers: headers,
        });
      }

      // For regular responses
      console.log('Forwarding regular response');
      return new Response(response.body, {
        status: response.status,
        headers: headers,
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        console.error('Request timeout after 10 seconds');
        return new Response('Camera connection timeout - please check if your camera is accessible', {
          status: 408,
          headers: corsHeaders,
        });
      }
      
      console.error('Network error connecting to camera:', fetchError);
      
      // Provide more specific error messages
      let errorMessage = 'Camera connection failed';
      if (fetchError.message.includes('NetworkError')) {
        errorMessage = 'Network error - please check if your camera is online and accessible';
      } else if (fetchError.message.includes('TypeError')) {
        errorMessage = 'Invalid camera URL or connection refused';
      }
      
      return new Response(errorMessage, {
        status: 502,
        headers: corsHeaders,
      });
    }

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(`Proxy error: ${error.message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});

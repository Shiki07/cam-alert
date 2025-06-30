
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

    console.log(`=== Camera Proxy Request ===`);
    console.log(`Method: ${req.method}`);
    console.log(`URL: ${req.url}`);
    console.log(`Headers:`, Object.fromEntries(req.headers.entries()));

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
    const timeoutId = setTimeout(() => {
      console.log('Request timeout after 30 seconds');
      controller.abort();
    }, 30000); // 30 second timeout

    try {
      // Fetch the stream from the camera
      const response = await fetch(targetUrl, {
        method: method,
        headers: {
          'User-Agent': 'Camera-Proxy/1.0',
          'Accept': '*/*',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`Response status: ${response.status} ${response.statusText}`);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.error(`Failed to fetch from target: ${response.status} ${response.statusText}`);
        
        let errorMessage = `Camera connection failed: ${response.status} ${response.statusText}`;
        if (response.status === 404) {
          errorMessage = 'Camera stream not found - please check the URL';
        } else if (response.status === 401) {
          errorMessage = 'Camera authentication required - please check credentials';
        } else if (response.status >= 500) {
          errorMessage = 'Camera server error - please check if the camera is running';
        }
        
        return new Response(errorMessage, {
          status: response.status,
          headers: corsHeaders,
        });
      }

      console.log(`Successfully connected to camera. Status: ${response.status}`);
      const contentType = response.headers.get('content-type');
      console.log('Response content-type:', contentType);

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
      if (contentType) {
        headers.set('content-type', contentType);
        console.log('Forwarding content-type:', contentType);
      }
      
      // Set appropriate cache headers for streaming
      headers.set('cache-control', 'no-cache, no-store, must-revalidate');
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');

      // For MJPEG streams, we need to handle the multipart response
      if (contentType && (contentType.includes('multipart') || contentType.includes('mjpeg'))) {
        console.log('Handling MJPEG multipart stream');
        
        // For MJPEG streams, we pass through the response body directly
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
      
      console.error('Network error connecting to camera:', fetchError);
      console.error('Error name:', fetchError.name);
      console.error('Error message:', fetchError.message);
      
      if (fetchError.name === 'AbortError') {
        console.error('Request timeout after 30 seconds');
        return new Response('Camera connection timeout - please check if your camera is accessible and responding', {
          status: 408,
          headers: corsHeaders,
        });
      }
      
      // Provide more specific error messages based on the error
      let errorMessage = 'Camera connection failed';
      if (fetchError.message.includes('NetworkError') || fetchError.message.includes('Failed to fetch')) {
        errorMessage = 'Network error - please check if your camera is online and accessible from this server';
      } else if (fetchError.message.includes('TypeError')) {
        errorMessage = 'Invalid camera URL or connection refused - please verify the camera URL';
      } else if (fetchError.message.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused - camera may be offline or port blocked';
      } else if (fetchError.message.includes('EHOSTUNREACH')) {
        errorMessage = 'Host unreachable - check network connectivity to camera';
      } else if (fetchError.message.includes('ETIMEDOUT')) {
        errorMessage = 'Connection timed out - camera may be slow to respond';
      }
      
      console.error('Final error message:', errorMessage);
      
      return new Response(errorMessage, {
        status: 502,
        headers: corsHeaders,
      });
    }

  } catch (error) {
    console.error('Proxy error:', error);
    console.error('Proxy error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return new Response(`Proxy error: ${error.message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});

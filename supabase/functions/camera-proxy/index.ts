
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
    let method = req.method;

    console.log(`=== Camera Proxy Request ===`);
    console.log(`Method: ${req.method}`);
    console.log(`URL: ${req.url}`);

    if (req.method === 'GET' || req.method === 'HEAD') {
      const url = new URL(req.url);
      const urlParam = url.searchParams.get('url');
      if (!urlParam) {
        console.error(`Missing url parameter in ${req.method} request`);
        return new Response('Missing url parameter', { 
          status: 400, 
          headers: corsHeaders 
        });
      }
      targetUrl = urlParam;
    } else if (req.method === 'POST') {
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

    // Increased timeout for better connection handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('Request timeout after 20 seconds');
      controller.abort();
    }, 20000);

    try {
      console.log(`Making ${method} request to camera...`);
      
      const response = await fetch(targetUrl, {
        method: method,
        headers: {
          'User-Agent': 'Camera-Proxy/1.0',
          'Accept': '*/*',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Accept-Encoding': 'identity',
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
          errorMessage = 'Camera stream not found - please check the URL and ensure the camera is running';
        } else if (response.status === 401) {
          errorMessage = 'Camera authentication required - please check credentials';
        } else if (response.status === 403) {
          errorMessage = 'Camera access forbidden - check firewall or camera permissions';
        } else if (response.status >= 500) {
          errorMessage = 'Camera server error - please check if the camera is running properly';
        } else if (response.status === 0) {
          errorMessage = 'Network error - camera may be unreachable or blocked by firewall';
        }
        
        return new Response(errorMessage, {
          status: response.status,
          headers: corsHeaders,
        });
      }

      console.log(`Successfully connected to camera. Status: ${response.status}`);
      const contentType = response.headers.get('content-type');
      console.log('Response content-type:', contentType);

      // For HEAD requests, just return the status with headers
      if (method === 'HEAD') {
        console.log('Returning HEAD response with status:', response.status);
        const headers = new Headers(corsHeaders);
        if (contentType) {
          headers.set('content-type', contentType);
        }
        headers.set('cache-control', 'no-cache');
        return new Response(null, {
          status: response.status,
          headers: headers,
        });
      }

      // Forward the response with CORS headers for GET requests
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
      
      // Add headers to prevent buffering
      headers.set('x-accel-buffering', 'no');

      // For MJPEG streams, we need to handle them specially
      if (contentType && (contentType.includes('multipart') || contentType.includes('mjpeg'))) {
        console.log('Handling MJPEG multipart stream - converting to streamable format');
        
        // Create a readable stream that processes the MJPEG data
        const stream = new ReadableStream({
          async start(controller) {
            const reader = response.body?.getReader();
            if (!reader) {
              controller.close();
              return;
            }

            try {
              let buffer = new Uint8Array();
              
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                // Append new data to buffer
                const newBuffer = new Uint8Array(buffer.length + value.length);
                newBuffer.set(buffer);
                newBuffer.set(value, buffer.length);
                buffer = newBuffer;
                
                // Send data in chunks to prevent browser buffering issues
                const chunkSize = 8192; // 8KB chunks
                while (buffer.length >= chunkSize) {
                  controller.enqueue(buffer.slice(0, chunkSize));
                  buffer = buffer.slice(chunkSize);
                }
              }
              
              // Send remaining data
              if (buffer.length > 0) {
                controller.enqueue(buffer);
              }
              
              controller.close();
            } catch (error) {
              console.error('Stream processing error:', error);
              controller.error(error);
            }
          }
        });

        return new Response(stream, {
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
        console.error('Request timeout after 20 seconds');
        return new Response('Camera connection timeout - please check if your camera is accessible from the internet. This could be due to: 1) Router port forwarding not configured, 2) ISP blocking the connection, 3) Camera not responding, or 4) Firewall blocking access', {
          status: 408,
          headers: corsHeaders,
        });
      }
      
      let errorMessage = 'Camera connection failed';
      if (fetchError.message.includes('NetworkError') || fetchError.message.includes('Failed to fetch')) {
        errorMessage = 'Network error - your camera at ' + targetUrl + ' is not reachable from the internet. Please check: 1) Router port forwarding configuration, 2) Camera is running, 3) No firewall blocking access';
      } else if (fetchError.message.includes('TypeError')) {
        errorMessage = 'Invalid camera URL or connection refused - please verify the camera URL and port forwarding';
      } else if (fetchError.message.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused - camera may be offline, port blocked, or not properly forwarded through router';
      } else if (fetchError.message.includes('EHOSTUNREACH')) {
        errorMessage = 'Host unreachable - check network connectivity and router configuration';
      } else if (fetchError.message.includes('ETIMEDOUT')) {
        errorMessage = 'Connection timed out - camera may be slow to respond or blocked by ISP/firewall';
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

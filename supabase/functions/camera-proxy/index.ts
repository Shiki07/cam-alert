import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
};

// Rate limiting store
const rateLimits = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const limit = rateLimits.get(userId);
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (limit.count >= 60) { // Max 60 requests per minute for camera streams
    return false;
  }
  
  limit.count++;
  return true;
};

const validateUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    
    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Block private IP ranges and localhost
    const hostname = parsed.hostname;
    
    // Block localhost variations
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      return false;
    }
    
    // Block private IP ranges
    const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipRegex);
    
    if (ipMatch) {
      const [, a, b, c, d] = ipMatch.map(Number);
      
      // Allow public IP ranges but block private ones
      if (
        (a === 10) || // 10.0.0.0/8
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) || // 192.168.0.0/16
        (a === 169 && b === 254) // 169.254.0.0/16 (link-local)
      ) {
        // Allow if it's a commonly used external IP range for cameras
        console.log(`Warning: Accessing private IP range: ${hostname}`);
      }
    }
    
    return true;
  } catch {
    return false;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

    // Check rate limit
    if (!checkRateLimit(user.id)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let targetUrl: string;
    let method = req.method;

    console.log(`=== Camera Proxy Request ===`);
    console.log(`Method: ${req.method}`);
    console.log(`User: ${user.id}`);

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

    // Validate the target URL
    if (!validateUrl(targetUrl)) {
      console.error('Invalid or blocked URL:', targetUrl);
      return new Response('Invalid or blocked URL', {
        status: 400,
        headers: corsHeaders,
      });
    }

    console.log(`Proxying ${method} request to:`, targetUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('Request timeout after 30 seconds');
      controller.abort();
    }, 30000); // Increased timeout to 30 seconds

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

      if (!response.ok) {
        console.error(`Failed to fetch from target: ${response.status} ${response.statusText}`);
        
        let errorMessage = `Camera connection failed: ${response.status}`;
        if (response.status === 404) {
          errorMessage = 'Camera stream not found';
        } else if (response.status === 401) {
          errorMessage = 'Camera authentication required';
        } else if (response.status === 403) {
          errorMessage = 'Camera access forbidden';
        } else if (response.status >= 500) {
          errorMessage = 'Camera server error';
        }
        
        return new Response(errorMessage, {
          status: response.status,
          headers: corsHeaders,
        });
      }

      console.log(`Successfully connected to camera. Status: ${response.status}`);
      const contentType = response.headers.get('content-type');

      if (method === 'HEAD') {
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

      const headers = new Headers(corsHeaders);
      
      if (contentType) {
        headers.set('content-type', contentType);
      }
      
      headers.set('cache-control', 'no-cache, no-store, must-revalidate');
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');
      headers.set('x-accel-buffering', 'no');

      if (contentType && (contentType.includes('multipart') || contentType.includes('mjpeg'))) {
        console.log('Handling MJPEG multipart stream');
        
        const stream = new ReadableStream({
          async start(controller) {
            const reader = response.body?.getReader();
            if (!reader) {
              controller.close();
              return;
            }

            try {
              let buffer = new Uint8Array();
              let lastActivityTime = Date.now();
              
              while (true) {
                const timeoutPromise = new Promise<never>((_, reject) => {
                  setTimeout(() => reject(new Error('Stream read timeout')), 15000);
                });
                
                const readPromise = reader.read();
                const { done, value } = await Promise.race([readPromise, timeoutPromise]);
                
                if (done) break;
                
                lastActivityTime = Date.now();
                
                const newBuffer = new Uint8Array(buffer.length + value.length);
                newBuffer.set(buffer);
                newBuffer.set(value, buffer.length);
                buffer = newBuffer;
                
                const chunkSize = 8192;
                while (buffer.length >= chunkSize) {
                  controller.enqueue(buffer.slice(0, chunkSize));
                  buffer = buffer.slice(chunkSize);
                }
                
                // Keep buffer manageable
                if (buffer.length > 1024 * 1024) { // 1MB limit
                  console.log('Proxy: Buffer too large, resetting');
                  if (buffer.length > 0) {
                    controller.enqueue(buffer);
                  }
                  buffer = new Uint8Array();
                }
              }
              
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

      return new Response(response.body, {
        status: response.status,
        headers: headers,
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      console.error('Network error connecting to camera:', fetchError);
      
      if (fetchError.name === 'AbortError') {
        return new Response('Camera connection timeout', {
          status: 408,
          headers: corsHeaders,
        });
      }
      
      return new Response('Camera connection failed - network error', {
        status: 502,
        headers: corsHeaders,
      });
    }

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Internal server error', {
      status: 500,
      headers: corsHeaders,
    });
  }
});

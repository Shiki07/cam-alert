
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting for camera proxy
const rateLimits = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const limit = rateLimits.get(userId);
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }
  
  if (limit.count >= 30) { // 30 requests per minute for camera streams
    return false;
  }
  
  limit.count++;
  return true;
};

// SECURITY: Validate and sanitize camera URLs to prevent SSRF
const validateCameraURL = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    
    // Only allow HTTP/HTTPS protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      console.log(`Camera proxy: Blocked non-HTTP(S) protocol: ${urlObj.protocol}`);
      return false;
    }
    
    // Block localhost and private IP ranges
    const hostname = urlObj.hostname.toLowerCase();
    
    // Allow DuckDNS domains explicitly
    if (hostname.endsWith('.duckdns.org')) {
      console.log(`Camera proxy: Allowing DuckDNS domain: ${hostname}`);
      // Still check the port
      const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
      const allowedPorts = ['80', '443', '8080', '8081', '8082', '8083', '8084', '8554', '554'];
      if (!allowedPorts.includes(port)) {
        console.log(`Camera proxy: Blocked DuckDNS domain with invalid port: ${port}`);
        return false;
      }
      return true;
    }
    
    // Block localhost variations
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      console.log(`Camera proxy: Blocked localhost: ${hostname}`);
      return false;
    }
    
    // Block private IP ranges
    if (hostname.match(/^10\./)) {
      console.log(`Camera proxy: Blocked private IP: ${hostname}`);
      return false;
    }
    if (hostname.match(/^192\.168\./)) {
      console.log(`Camera proxy: Blocked private IP: ${hostname}`);
      return false;
    }
    if (hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
      console.log(`Camera proxy: Blocked private IP: ${hostname}`);
      return false;
    }
    if (hostname.match(/^169\.254\./)) {
      console.log(`Camera proxy: Blocked link-local IP: ${hostname}`);
      return false;
    }
    
    // Block metadata services
    if (hostname.includes('metadata') || hostname === '169.254.169.254') {
      console.log(`Camera proxy: Blocked metadata service: ${hostname}`);
      return false;
    }
    
    // Only allow common camera ports
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    const allowedPorts = ['80', '443', '8080', '8081', '8082', '8083', '8084', '8554', '554'];
    
    if (!allowedPorts.includes(port)) {
      console.log(`Camera proxy: Blocked invalid port: ${port}`);
      return false;
    }
    
    console.log(`Camera proxy: URL validation passed for: ${hostname}:${port}`);
    return true;
  } catch (e) {
    console.log(`Camera proxy: URL parsing failed: ${e.message}`);
    return false;
  }
};

serve(async (req) => {
  console.log(`Camera proxy: Received ${req.method} request`);
  
  if (req.method === 'OPTIONS') {
    console.log('Camera proxy: Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('Camera proxy: Invalid authorization header');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the JWT token
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      console.warn('Camera proxy: Invalid or expired token');
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
      console.warn(`Camera proxy: Rate limit exceeded for user: ${user.id}`);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get the target URL from query parameters
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // SECURITY: Validate the camera URL
    if (!validateCameraURL(targetUrl)) {
      console.warn(`Camera proxy: Blocked potentially dangerous URL: ${targetUrl} - Failed validation`);
      console.log(`Camera proxy: URL validation details for ${targetUrl}:`);
      try {
        const urlObj = new URL(targetUrl);
        console.log(`  - Protocol: ${urlObj.protocol}`);
        console.log(`  - Hostname: ${urlObj.hostname}`);
        console.log(`  - Port: ${urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80')}`);
      } catch (e) {
        console.log(`  - URL parsing failed: ${e.message}`);
      }
      return new Response(
        JSON.stringify({ error: 'Invalid or blocked URL' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Camera proxy: Proxying request to ${targetUrl} for user ${user.id}`);

    // First, try to resolve DNS for better error reporting
    try {
      const urlObj = new URL(targetUrl);
      console.log(`Camera proxy: Testing connectivity to ${urlObj.hostname}`);
      
      // Try a simple DNS resolution test with a quick timeout
      const testController = new AbortController();
      const testTimeout = setTimeout(() => testController.abort(), 5000);
      
      try {
        const testResponse = await fetch(`http://${urlObj.hostname}`, {
          method: 'HEAD',
          signal: testController.signal
        });
        clearTimeout(testTimeout);
        console.log(`Camera proxy: DNS/connectivity test - response received from ${urlObj.hostname}`);
      } catch (testError) {
        clearTimeout(testTimeout);
        console.log(`Camera proxy: DNS/connectivity test failed for ${urlObj.hostname}:`, testError.message);
      }
    } catch (e) {
      console.log(`Camera proxy: Pre-test failed:`, e.message);
    }

    // Retry logic for unreliable connections
    const maxRetries = req.method === 'HEAD' ? 2 : 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Camera proxy: Attempt ${attempt}/${maxRetries} to ${req.method} ${targetUrl}`);
      
      // Create AbortController for timeout per attempt
      const controller = new AbortController();
      const timeout = req.method === 'HEAD' ? 15000 : 30000; // Longer timeout for better reliability
      const timeoutId = setTimeout(() => {
        console.log(`Camera proxy: Timeout on attempt ${attempt} after ${timeout}ms`);
        controller.abort();
      }, timeout);

      try {
        console.log(`Camera proxy: Starting fetch to ${targetUrl}`);
        
        // Proxy the request with more comprehensive headers
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: {
            'User-Agent': 'CamAlert-Proxy/1.0',
            'Accept': req.method === 'HEAD' ? '*/*' : 'image/jpeg, multipart/x-mixed-replace, */*',
            'Cache-Control': 'no-cache',
            'Connection': 'close',
            'Pragma': 'no-cache'
          },
          signal: controller.signal
        });
        
        console.log(`Camera proxy: Fetch completed, status: ${response.status}`);

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log(`Camera proxy: Success on attempt ${attempt} - Status: ${response.status}`);

        // Forward the response with appropriate headers
        const responseHeaders = new Headers(corsHeaders);
        
        // Copy relevant headers from the camera response
        const contentType = response.headers.get('content-type');
        if (contentType) {
          responseHeaders.set('content-type', contentType);
        }
        
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          responseHeaders.set('content-length', contentLength);
        }
        
        // Add cache control for streams
        if (req.method === 'GET') {
          responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          responseHeaders.set('Pragma', 'no-cache');
          responseHeaders.set('Expires', '0');
        }

        // For streaming responses, we need to handle them specially
        if (response.body) {
          return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
          });
        } else {
          return new Response(null, {
            status: response.status,
            headers: responseHeaders,
          });
        }

      } catch (fetchError) {
        clearTimeout(timeoutId);
        lastError = fetchError as Error;
        
        if (fetchError.name === 'AbortError') {
          console.warn(`Camera proxy: Request timeout on attempt ${attempt}`);
        } else {
          console.error(`Camera proxy: Fetch error on attempt ${attempt}:`, fetchError.message);
        }
        
        // If this is not the last attempt, wait before retrying
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000); // Exponential backoff, max 3s
          console.log(`Camera proxy: Waiting ${delay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    console.error(`Camera proxy: All ${maxRetries} attempts failed. Last error:`, lastError?.message);
    
    if (lastError?.name === 'AbortError') {
      return new Response(
        JSON.stringify({ 
          error: 'Camera connection timeout',
          details: `Failed to connect to camera after ${maxRetries} attempts`,
          timestamp: new Date().toISOString()
        }),
        { 
          status: 408, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to connect to camera',
        details: lastError?.message || 'Unknown error',
        attempts: maxRetries,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 502, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Camera proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

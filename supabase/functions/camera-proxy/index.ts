
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma, accept',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'content-type, content-length'
  };
};

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
const isPrivateIp = (ip: string): boolean => {
  // IPv4 private ranges - be more permissive for camera access
  if (/^(10\.\d+\.\d+\.\d+)|(192\.168\.\d+\.\d+)|(172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)|(169\.254\.\d+\.\d+)|(127\.\d+\.\d+\.\d+)$/.test(ip)) {
    return true;
  }
  // IPv6 private ranges
  if (/^(::1)$/.test(ip)) return true; // loopback
  if (/^(fc|fd)/i.test(ip)) return true; // unique local
  if (/^fe80:/i.test(ip)) return true; // link-local
  return false;
};

const resolveAndValidateHost = async (hostname: string): Promise<boolean> => {
  try {
    const queries = [
      fetch(`https://dns.google/resolve?name=${hostname}&type=A`).then(r => r.ok ? r.json() : { Answer: [] }).catch(() => ({ Answer: [] })),
      fetch(`https://dns.google/resolve?name=${hostname}&type=AAAA`).then(r => r.ok ? r.json() : { Answer: [] }).catch(() => ({ Answer: [] }))
    ];
    const [aRec, aaaaRec] = await Promise.all(queries);
    const ips: string[] = [];
    for (const rec of [aRec, aaaaRec]) {
      if (rec && Array.isArray(rec.Answer)) {
        for (const ans of rec.Answer) {
          if (ans.data && typeof ans.data === 'string') ips.push(ans.data);
        }
      }
    }
    if (!ips.length) return false;
    // Ensure all resolved IPs are public
    return ips.every(ip => !isPrivateIp(ip));
  } catch (_) {
    return false;
  }
};

const validateCameraURL = async (url: string): Promise<boolean> => {
  try {
    const urlObj = new URL(url);
    // Only allow HTTP/HTTPS protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      console.log(`Camera proxy: Blocked non-HTTP(S) protocol: ${urlObj.protocol}`);
      return false;
    }

    const hostname = urlObj.hostname.toLowerCase();

    // Allow any port for cameras (including common local camera ports)
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    const allowedPorts = ['80', '443', '8000'];
    if (!allowedPorts.includes(port)) {
      console.log(`Camera proxy: Blocked invalid port: ${port}`);
      return false;
    }

    // Special handling for DuckDNS and other dynamic DNS services
    if (hostname.includes('.duckdns.org') || 
        hostname.includes('.no-ip.') || 
        hostname.includes('.ddns.net')) {
      console.log(`Camera proxy: Allowing dynamic DNS domain: ${hostname}`);
      return true;
    }

    // Allow private IP ranges for authenticated camera access (local networks)
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
      console.log(`Camera proxy: Allowing private IP camera: ${hostname}`);
      return true;
    }

    // Block localhost variations for security
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      console.log(`Camera proxy: Blocked localhost: ${hostname}`);
      return false;
    }

    // Resolve DNS and ensure public IPs only (prevents DNS rebinding)
    const dnsOk = await resolveAndValidateHost(hostname);
    if (!dnsOk) {
      console.log(`Camera proxy: DNS validation failed or resolved to private IPs for ${hostname}`);
      console.log(`  - Protocol: ${urlObj.protocol}`);
      console.log(`  - Hostname: ${hostname}`);
      console.log(`  - Port: ${port}`);
      return false;
    }

    return true;
  } catch (e) {
    console.log(`Camera proxy: URL parsing failed: ${e.message}`);
    return false;
  }
};

serve(async (req) => {
  console.log(`Camera proxy: Received ${req.method} request`);
  
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    console.log('Camera proxy: Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get URL parameters first
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');
    const tokenParam = url.searchParams.get('token');
    
    // Get the authorization from header OR query parameter (for img elements)
    const authHeader = req.headers.get('authorization');
    
    let jwt: string | null = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      jwt = authHeader.replace('Bearer ', '');
      console.log('Camera proxy: Using Authorization header for authentication');
    } else if (tokenParam) {
      jwt = tokenParam;
      console.log('Camera proxy: Using URL parameter for authentication');
    }
    
    if (!jwt) {
      console.warn('Camera proxy: No authentication token provided');
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
    
    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // SECURITY: Validate the camera URL (and provide clear errors)
    try {
      const tUrl = new URL(targetUrl);
      const hostname = tUrl.hostname;
      const isLan = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|127\.|\[?::1\]?)/.test(hostname);

      // IMPORTANT: Supabase Edge cannot reach private LAN IPs. Return a clear error early.
      if (isLan) {
        console.warn(`Camera proxy: LAN/private address not reachable from cloud: ${hostname}`);
        return new Response(
          JSON.stringify({
            error: 'LAN address not reachable from cloud',
            code: 'lan_not_accessible',
            details: `Supabase Edge cannot access ${hostname}. Expose the camera via your router (port forward) and a DNS (e.g., DuckDNS) or open the app on the same LAN over HTTP.`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    } catch (_) {
      // fallthrough to validation
    }

    if (!(await validateCameraURL(targetUrl))) {
      console.warn(`Camera proxy: Blocked potentially dangerous URL (failed validation)`);
      try {
        const urlObj = new URL(targetUrl);
        console.log(`  - Protocol: ${urlObj.protocol}`);
        console.log(`  - Hostname: ${urlObj.hostname}`);
        console.log(`  - Port: ${urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80')}`);
      } catch (e) {
        console.log(`  - URL parsing failed: ${e.message}`);
      }
      return new Response(
        JSON.stringify({ error: 'Invalid or blocked URL', code: 'validation_failed' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Camera proxy: Proxying request to ${targetUrl} for user ${user.id}`);

    // Enhanced connectivity test with more detailed diagnostics
    try {
      const urlObj = new URL(targetUrl);
      console.log(`Camera proxy: Testing connectivity to ${urlObj.hostname}:${urlObj.port || '8000'}`);
      
      // First try a basic DNS lookup using a different method
      try {
        const dnsTest = await fetch(`https://dns.google/resolve?name=${urlObj.hostname}&type=A`);
        const dnsResult = await dnsTest.json();
        console.log(`Camera proxy: DNS lookup result:`, dnsResult);
        
        if (dnsResult.Status !== 0) {
          console.warn(`Camera proxy: DNS resolution failed for ${urlObj.hostname}`);
        }
      } catch (dnsError) {
        console.log(`Camera proxy: DNS lookup failed:`, dnsError.message);
      }
      
      // Try a simple connectivity test with very short timeout
      const testController = new AbortController();
      const testTimeout = setTimeout(() => testController.abort(), 3000); // 3 second timeout
      
      try {
        const testResponse = await fetch(`http://${urlObj.hostname}:${urlObj.port || '8000'}`, {
          method: 'HEAD',
          signal: testController.signal,
          headers: {
            'User-Agent': 'CamAlert-ConnTest/1.0'
          }
        });
        clearTimeout(testTimeout);
        console.log(`Camera proxy: Connectivity test successful - Status: ${testResponse.status}`);
      } catch (testError) {
        clearTimeout(testTimeout);
        console.log(`Camera proxy: Connectivity test failed for ${urlObj.hostname}:${urlObj.port || '8000'}:`, testError.message);
        
        // If connectivity test fails, provide detailed error message
        if (testError.name === 'AbortError') {
          console.warn(`Camera proxy: Connection timeout - camera may be offline or network unreachable`);
        }
      }
    } catch (e) {
      console.log(`Camera proxy: Pre-test setup failed:`, e.message);
    }

    // Retry logic for unreliable connections
    const maxRetries = req.method === 'HEAD' ? 2 : 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Camera proxy: Attempt ${attempt}/${maxRetries} to ${req.method} ${targetUrl}`);
      
      // Create AbortController for timeout per attempt
      const controller = new AbortController();
      const timeout = req.method === 'HEAD' ? 10000 : 300000; // 5 minute timeout for streaming requests
      const timeoutId = setTimeout(() => {
        console.log(`Camera proxy: Timeout on attempt ${attempt} after ${timeout}ms`);
        controller.abort();
      }, timeout);

      try {
        console.log(`Camera proxy: Starting fetch to ${targetUrl}`);
        
        // Proxy the request with improved connection handling for MJPEG streams
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: {
            'User-Agent': 'CamAlert-Proxy/1.0',
            'Accept': 'multipart/x-mixed-replace, image/jpeg, */*',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive', // Use keep-alive for persistent connections
            'Keep-Alive': 'timeout=300, max=1000', // 5 minute timeout, up to 1000 requests
            'Pragma': 'no-cache'
          },
          signal: controller.signal,
          redirect: 'manual',
          // Enable connection pooling and reuse
          keepalive: true
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
          const delay = attempt === 1 ? 500 : Math.min(1000 * attempt, 2000); // Faster initial retry
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Basic per-user rate limiting
const rateLimits = new Map<string, { count: number; resetTime: number }>();
const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const limit = rateLimits.get(userId);
  if (!limit || now > limit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }
  if (limit.count >= 20) return false; // 20 diagnostics/min
  limit.count++;
  return true;
};

const isPrivateIp = (ip: string): boolean => {
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|127\.)/.test(ip)) return true;
  if (/^(::1)$/.test(ip)) return true;
  if (/^(fc|fd)/i.test(ip)) return true;
  if (/^fe80:/i.test(ip)) return true;
  return false;
};

const resolveAndValidateHost = async (hostname: string): Promise<boolean> => {
  try {
    const [a, aaaa] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${hostname}&type=A`).then(r => r.ok ? r.json() : { Answer: [] }).catch(() => ({ Answer: [] })),
      fetch(`https://dns.google/resolve?name=${hostname}&type=AAAA`).then(r => r.ok ? r.json() : { Answer: [] }).catch(() => ({ Answer: [] }))
    ]);
    const ips: string[] = [];
    for (const rec of [a, aaaa]) {
      if (rec && Array.isArray(rec.Answer)) {
        for (const ans of rec.Answer) {
          if (ans.data) ips.push(ans.data);
        }
      }
    }
    return ips.length > 0 && ips.every(ip => !isPrivateIp(ip));
  } catch {
    return false;
  }
};

const validateTargetUrl = async (raw: string): Promise<{ ok: boolean; reason?: string }> => {
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return { ok: false, reason: 'protocol' };
    if (['localhost', '127.0.0.1', '::1'].includes(u.hostname.toLowerCase())) return { ok: false, reason: 'localhost' };
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    const allowedPorts = ['80', '443', '8000'];
    if (!allowedPorts.includes(port)) return { ok: false, reason: 'port' };
    if (!(await resolveAndValidateHost(u.hostname))) return { ok: false, reason: 'dns' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'parse' };
  }
};

serve(async (req) => {
  console.log(`Camera diagnostics: Received ${req.method} request`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let targetUrl = url.searchParams.get('url') || '';

    // Also accept JSON body with { url }
    if (!targetUrl && (req.method === 'POST' || req.method === 'PUT')) {
      try {
        const body = await req.json();
        if (body?.url && typeof body.url === 'string') {
          targetUrl = body.url;
        }
      } catch (_) {
        // ignore body parse errors
      }
    }

    if (!targetUrl) {
      targetUrl = 'http://alepava.duckdns.org:8000';
    }
    
    // Authenticate user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const jwt = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Running diagnostics for ${targetUrl}`);
    
    const results = {
      timestamp: new Date().toISOString(),
      targetUrl,
      tests: []
    };

    // Test 1: DNS Resolution
    try {
      const urlObj = new URL(targetUrl);
      const hostname = urlObj.hostname;
      
      console.log(`Testing DNS resolution for ${hostname}`);
      const dnsResponse = await fetch(`https://dns.google/resolve?name=${hostname}&type=A`);
      const dnsData = await dnsResponse.json();
      
      results.tests.push({
        name: 'DNS Resolution',
        success: dnsData.Status === 0,
        details: dnsData,
        message: dnsData.Status === 0 ? 
          `Resolved to: ${dnsData.Answer?.map(a => a.data).join(', ') || 'No A records'}` :
          `DNS resolution failed with status ${dnsData.Status}`
      });
    } catch (error) {
      results.tests.push({
        name: 'DNS Resolution',
        success: false,
        error: error.message
      });
    }

    // Test 2: HTTP connectivity on port 80 (basic reachability)
    try {
      const urlObj = new URL(targetUrl);
      const basicUrl = `http://${urlObj.hostname}`;
      
      console.log(`Testing basic HTTP connectivity to ${basicUrl}`);
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(basicUrl, {
        method: 'GET',
        signal: controller.signal
      });
      
      results.tests.push({
        name: 'Basic HTTP (Port 80)',
        success: true,
        details: { status: response.status, statusText: response.statusText },
        message: `Port 80 is reachable (Status: ${response.status})`
      });
    } catch (error) {
      results.tests.push({
        name: 'Basic HTTP (Port 80)',
        success: false,
        error: error.message,
        message: error.name === 'AbortError' ? 'Connection timeout' : `Connection failed: ${error.message}`
      });
    }

    // Test 3: Target port connectivity 
    try {
      console.log(`Testing target URL connectivity: ${targetUrl}`);
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(targetUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'CamAlert-Diagnostics/1.0'
        }
      });
      
      results.tests.push({
        name: 'Target URL Connectivity',
        success: true,
        details: { 
          status: response.status, 
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        },
        message: `Target URL is reachable (Status: ${response.status})`
      });
    } catch (error) {
      results.tests.push({
        name: 'Target URL Connectivity',
        success: false,
        error: error.message,
        message: error.name === 'AbortError' ? 
          'Connection timeout - port may be closed or filtered' : 
          `Connection failed: ${error.message}`
      });
    }

    // Test 4: MJPEG Stream test
    try {
      const streamUrl = targetUrl.includes('stream.mjpg') ? targetUrl : `${targetUrl}/stream.mjpg`;
      console.log(`Testing MJPEG stream: ${streamUrl}`);
      
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(streamUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'CamAlert-Diagnostics/1.0',
          'Accept': 'image/jpeg, multipart/x-mixed-replace, */*'
        }
      });
      
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      
      results.tests.push({
        name: 'MJPEG Stream',
        success: response.ok,
        details: { 
          status: response.status,
          contentType,
          contentLength,
          headers: Object.fromEntries(response.headers.entries())
        },
        message: response.ok ? 
          `MJPEG stream accessible (Type: ${contentType})` :
          `Stream not accessible (Status: ${response.status})`
      });
    } catch (error) {
      results.tests.push({
        name: 'MJPEG Stream',
        success: false,
        error: error.message,
        message: error.name === 'AbortError' ? 
          'Stream timeout' : 
          `Stream test failed: ${error.message}`
      });
    }

    // Adjust Port 80 test to informational success when target stream tests pass
    const dnsOk = (results.tests.find((t: any) => t.name === 'DNS Resolution')?.success ?? false);
    const targetOk = (results.tests.find((t: any) => t.name === 'Target URL Connectivity')?.success ?? false);
    const streamOk = (results.tests.find((t: any) => t.name === 'MJPEG Stream')?.success ?? false);
    const basicIdx = results.tests.findIndex((t: any) => t.name === 'Basic HTTP (Port 80)');
    
    // Make Port 80 informational when the actual camera functionality works
    if (targetOk && streamOk && basicIdx >= 0 && results.tests[basicIdx].success === false) {
      results.tests[basicIdx].success = true;
      results.tests[basicIdx].message = 'Port 80 closed (informational) — camera works without web server on port 80.';
    }

    // Summary
    const successCount = results.tests.filter((test: any) => test.success).length;
    const totalTests = results.tests.length;
    
    // Camera is functional if target and stream work, regardless of DNS/Port 80 issues
    const functionalCamera = targetOk && streamOk;
    
    results.summary = {
      testsRun: totalTests,
      testsPassed: successCount,
      testsFailed: totalTests - successCount,
      overallSuccess: functionalCamera,
      recommendation: generateRecommendation(results.tests)
    };

    console.log(`Diagnostics completed: ${successCount}/${totalTests} tests passed`);
    
    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Diagnostics error:', error);
    return new Response(JSON.stringify({ error: 'Diagnostics failed', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function generateRecommendation(tests: any[]): string {
  const dnsTest = tests.find(t => t.name === 'DNS Resolution');
  const basicHttpTest = tests.find(t => t.name === 'Basic HTTP (Port 80)');
  const targetTest = tests.find(t => t.name === 'Target URL Connectivity');
  const streamTest = tests.find(t => t.name === 'MJPEG Stream');

  // Camera is functional if target and stream work
  if (targetTest?.success && streamTest?.success) {
    if (!dnsTest?.success) {
      return "Camera is accessible and working! DNS resolution issue is temporary and doesn't affect camera functionality.";
    }
    return "Camera is accessible and working perfectly!";
  }
  
  if (!dnsTest?.success && !targetTest?.success) {
    return "DNS resolution failed. This might be a temporary DNS issue. Try again in a few minutes, or check if your DuckDNS domain is configured correctly.";
  }
  
  if (!targetTest?.success) {
    return "Camera target port is not accessible. Check port forwarding rules in your router and ensure the camera service is running on the correct port.";
  }
  
  if (!streamTest?.success) {
    return "Camera service is running but MJPEG stream is not accessible. Check camera configuration and stream URL.";
  }
  
  return "Camera diagnostics completed.";
}
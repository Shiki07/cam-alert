import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  console.log(`Camera diagnostics: Received ${req.method} request`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url') || 'http://alepava.duckdns.org:8081';
    
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
        method: 'HEAD',
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
        method: 'HEAD',
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

    // Summary
    const successCount = results.tests.filter(test => test.success).length;
    const totalTests = results.tests.length;
    
    results.summary = {
      testsRun: totalTests,
      testsPassed: successCount,
      testsFailed: totalTests - successCount,
      overallSuccess: successCount === totalTests,
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

  if (!dnsTest?.success) {
    return "DNS resolution failed. Check if your DuckDNS domain is configured correctly.";
  }
  
  if (!basicHttpTest?.success) {
    return "Basic connectivity failed. Your server/router may be offline, or firewall is blocking all connections.";
  }
  
  if (!targetTest?.success) {
    return "Port 8081 is not accessible. Check port forwarding rules in your router and ensure the camera service is running.";
  }
  
  if (!streamTest?.success) {
    return "Camera service is running but MJPEG stream is not accessible. Check camera configuration.";
  }
  
  return "All tests passed! Your camera should be accessible.";
}
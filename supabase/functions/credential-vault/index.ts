import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting store
const rateLimits = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const limit = rateLimits.get(userId);
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }
  
  if (limit.count >= 30) { // 30 requests per minute
    return false;
  }
  
  limit.count++;
  return true;
};

// Server-side encryption using the secret key
const getEncryptionKey = async (): Promise<CryptoKey> => {
  const keyString = Deno.env.get('CREDENTIAL_ENCRYPTION_KEY');
  if (!keyString) {
    throw new Error('Encryption key not configured');
  }
  
  // Derive a proper 256-bit key from the secret using SHA-256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
  
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

// Generate random IV
const generateIV = (): Uint8Array => {
  return crypto.getRandomValues(new Uint8Array(12));
};

// Convert ArrayBuffer to base64
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// Convert base64 to ArrayBuffer
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

// Encrypt a password
const encryptPassword = async (password: string): Promise<string> => {
  if (!password) return '';
  
  const key = await getEncryptionKey();
  const iv = generateIV();
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    passwordData
  );
  
  // Prepend IV to ciphertext (IV is 12 bytes)
  const resultBuffer = new Uint8Array(12 + ciphertext.byteLength);
  resultBuffer.set(iv);
  resultBuffer.set(new Uint8Array(ciphertext), 12);
  
  // Add version prefix for future compatibility
  return 'v2:' + arrayBufferToBase64(resultBuffer.buffer);
};

// Decrypt a password
const decryptPassword = async (encryptedPassword: string): Promise<string> => {
  if (!encryptedPassword) return '';
  
  try {
    // Check for version prefix
    let cipherData = encryptedPassword;
    if (encryptedPassword.startsWith('v2:')) {
      cipherData = encryptedPassword.slice(3);
    } else {
      // Legacy v1 format (client-side encrypted) - cannot decrypt server-side
      // Return empty to signal re-encryption is needed
      console.log('Legacy v1 encryption detected - requires migration');
      return '';
    }
    
    const key = await getEncryptionKey();
    const combined = new Uint8Array(base64ToArrayBuffer(cipherData));
    
    // Extract IV (first 12 bytes)
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify JWT token
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit
    if (!checkRateLimit(user.id)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body = await req.json();
    const { action, password, cameraLabel, credentialId } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    switch (action) {
      case 'encrypt': {
        // Encrypt a password and optionally save to database
        if (!password) {
          return new Response(
            JSON.stringify({ error: 'Missing password parameter' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate password length (security limit)
        if (password.length > 256) {
          return new Response(
            JSON.stringify({ error: 'Password too long (max 256 characters)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const encrypted = await encryptPassword(password);
        
        console.log(`Encrypted credential for user: ${user.id.substring(0, 8)}...`);
        
        return new Response(
          JSON.stringify({ success: true, ciphertext: encrypted }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'decrypt': {
        // Decrypt a password - only for credentials owned by the user
        if (!credentialId) {
          return new Response(
            JSON.stringify({ error: 'Missing credentialId parameter' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch the credential - RLS will ensure user owns it
        const { data: credential, error: fetchError } = await supabase
          .from('camera_credentials')
          .select('password_ciphertext, user_id')
          .eq('id', credentialId)
          .eq('user_id', user.id) // Double-check ownership
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching credential:', fetchError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch credential' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!credential) {
          return new Response(
            JSON.stringify({ error: 'Credential not found or access denied' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!credential.password_ciphertext) {
          return new Response(
            JSON.stringify({ success: true, password: '' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const decrypted = await decryptPassword(credential.password_ciphertext);
        
        // Log access for audit trail (truncated user ID)
        console.log(`Decrypted credential ${credentialId.substring(0, 8)}... for user: ${user.id.substring(0, 8)}...`);
        
        return new Response(
          JSON.stringify({ success: true, password: decrypted }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'decrypt-by-label': {
        // Decrypt a password by camera label
        if (!cameraLabel) {
          return new Response(
            JSON.stringify({ error: 'Missing cameraLabel parameter' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch the credential by label
        const { data: credential, error: fetchError } = await supabase
          .from('camera_credentials')
          .select('id, password_ciphertext')
          .eq('user_id', user.id)
          .eq('camera_label', cameraLabel)
          .maybeSingle();

        if (fetchError) {
          console.error('Error fetching credential:', fetchError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch credential' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!credential) {
          return new Response(
            JSON.stringify({ success: true, password: '' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!credential.password_ciphertext) {
          return new Response(
            JSON.stringify({ success: true, password: '' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const decrypted = await decryptPassword(credential.password_ciphertext);
        
        console.log(`Decrypted credential by label for user: ${user.id.substring(0, 8)}...`);
        
        return new Response(
          JSON.stringify({ success: true, password: decrypted }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'check-migration': {
        // Check if credentials need migration from v1 to v2 encryption
        const { data: credentials, error: fetchError } = await supabase
          .from('camera_credentials')
          .select('id, password_ciphertext')
          .eq('user_id', user.id);

        if (fetchError) {
          return new Response(
            JSON.stringify({ error: 'Failed to fetch credentials' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const needsMigration = (credentials || []).filter(
          c => c.password_ciphertext && !c.password_ciphertext.startsWith('v2:')
        );

        return new Response(
          JSON.stringify({ 
            success: true, 
            needsMigration: needsMigration.length > 0,
            count: needsMigration.length,
            credentialIds: needsMigration.map(c => c.id)
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Credential vault error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

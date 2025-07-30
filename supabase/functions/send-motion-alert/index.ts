
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting store (in production, use Redis or similar)
const rateLimits = new Map<string, { count: number; resetTime: number }>();

const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const limit = rateLimits.get(userId);
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }
  
  if (limit.count >= 3) { // Max 3 emails per minute per user
    return false;
  }
  
  limit.count++;
  return true;
};

// Enhanced email validation
const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
};

// Input sanitization
const sanitizeInput = (input: string): string => {
  return input.trim().replace(/[<>'"&]/g, '');
};

interface MotionAlertRequest {
  email: string;
  attachmentData?: string; // base64 encoded image/video
  attachmentType?: 'image' | 'video';
  timestamp: string;
  motionLevel?: number;
}

const handler = async (req: Request): Promise<Response> => {
  console.log('Motion alert function called');

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('Invalid authorization header format');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client for auth verification
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
      console.warn('Invalid or expired token');
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
      console.warn(`Rate limit exceeded for user: ${user.id}`);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { email, attachmentData, attachmentType, timestamp, motionLevel }: MotionAlertRequest = await req.json();
    
    // Enhanced input validation
    if (!validateEmail(email)) {
      console.warn('Invalid email format provided');
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate timestamp
    const alertTime = new Date(timestamp);
    if (isNaN(alertTime.getTime())) {
      console.warn('Invalid timestamp provided');
      return new Response(
        JSON.stringify({ error: 'Invalid timestamp' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate motion level if provided
    if (motionLevel !== undefined && (typeof motionLevel !== 'number' || motionLevel < 0 || motionLevel > 100)) {
      console.warn('Invalid motion level provided');
      return new Response(
        JSON.stringify({ error: 'Invalid motion level' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate attachment data if provided
    if (attachmentData && (!attachmentType || !['image', 'video'].includes(attachmentType))) {
      console.warn('Invalid attachment type provided');
      return new Response(
        JSON.stringify({ error: 'Invalid attachment type' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Sanitize email for logging (security)
    const sanitizedEmail = sanitizeInput(email);
    console.log('Sending motion alert to:', sanitizedEmail.substring(0, 3) + '***@' + sanitizedEmail.split('@')[1]);

    const emailData: any = {
      from: "CamAlert <noreply@resend.dev>",
      to: [sanitizeInput(email)],
      subject: "🚨 Motion Detected - CamAlert",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626; text-align: center;">🚨 Motion Detected!</h1>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Alert Details:</strong></p>
            <ul>
              <li><strong>Time:</strong> ${sanitizeInput(new Date(timestamp).toLocaleString())}</li>
              <li><strong>Motion Level:</strong> ${motionLevel ? sanitizeInput(motionLevel.toFixed(2)) + '%' : 'N/A'}</li>
              <li><strong>Camera:</strong> Main Feed</li>
            </ul>
          </div>
          
          ${attachmentData ? `
          <div style="text-align: center; margin: 20px 0;">
            <h3>📸 Motion Detection Image:</h3>
            <img src="data:image/jpeg;base64,${attachmentData}" 
                 alt="Motion Detection Capture" 
                 style="max-width: 100%; height: auto; border: 2px solid #dc2626; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);" />
          </div>
          ` : ''}
          
          <p>Motion has been detected in your camera feed. ${attachmentData ? 'The captured image is shown above.' : ''}</p>
          
          <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #1e40af;">
              <strong>📹 Automatic Recording:</strong> Recording has been automatically started and will be saved to your configured storage location.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This is an automated alert from your CamAlert system. To stop receiving these notifications, please disable motion detection in your camera settings.
          </p>
        </div>
      `,
    };

    // Remove attachment logic since we're embedding the image
    if (attachmentData && attachmentType) {
      console.log(`Image embedded directly in email: type=${attachmentType}, data length=${attachmentData.length}`);
    } else {
      console.log('No attachment data provided');
    }

    const emailResponse = await resend.emails.send(emailData);
    
    if (emailResponse.error) {
      console.error('Resend API error:', emailResponse.error);
      throw new Error(`Email sending failed: ${emailResponse.error.message}`);
    }
    
    console.log(`Motion alert email sent successfully for user: ${user.id}, email ID: ${emailResponse.data?.id}`);
    
    if (attachmentData) {
      console.log('Email sent WITH embedded image');
    } else {
      console.log('Email sent WITHOUT image');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      emailId: emailResponse.data?.id 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error sending motion alert:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

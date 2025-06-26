
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const { email, attachmentData, attachmentType, timestamp, motionLevel }: MotionAlertRequest = await req.json();
    
    console.log('Sending motion alert to:', email);

    const emailData: any = {
      from: "CamAlert <noreply@resend.dev>",
      to: [email],
      subject: "🚨 Motion Detected - CamAlert",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626; text-align: center;">🚨 Motion Detected!</h1>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Alert Details:</strong></p>
            <ul>
              <li><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</li>
              <li><strong>Motion Level:</strong> ${motionLevel ? motionLevel.toFixed(2) + '%' : 'N/A'}</li>
              <li><strong>Camera:</strong> Main Feed</li>
            </ul>
          </div>
          
          <p>Motion has been detected in your camera feed. ${attachmentData ? `Please see the attached ${attachmentType} for details.` : ''}</p>
          
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

    // Add attachment if provided
    if (attachmentData && attachmentType) {
      const buffer = Uint8Array.from(atob(attachmentData), c => c.charCodeAt(0));
      const filename = `motion-${Date.now()}.${attachmentType === 'image' ? 'jpg' : 'webm'}`;
      
      emailData.attachments = [{
        filename,
        content: buffer,
        type: attachmentType === 'image' ? 'image/jpeg' : 'video/webm',
      }];
    }

    const emailResponse = await resend.emails.send(emailData);
    
    console.log("Motion alert email sent successfully:", emailResponse);

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

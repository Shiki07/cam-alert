-- Add notification preferences to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS notification_email TEXT,
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS duckdns_domain TEXT,
ADD COLUMN IF NOT EXISTS duckdns_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS duckdns_manual_ip TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.notification_email IS 'Email address for motion detection notifications';
COMMENT ON COLUMN public.profiles.email_notifications_enabled IS 'Whether email notifications are enabled';
COMMENT ON COLUMN public.profiles.duckdns_domain IS 'DuckDNS domain name (without .duckdns.org suffix)';
COMMENT ON COLUMN public.profiles.duckdns_enabled IS 'Whether DuckDNS dynamic DNS is enabled';
COMMENT ON COLUMN public.profiles.duckdns_manual_ip IS 'Optional manual IP override for DuckDNS';
-- Fix relay_frames RLS policies to use requesting_user_id() for consistency with other tables
-- This ensures all tables use the same authentication function pattern

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own relay frames" ON public.relay_frames;
DROP POLICY IF EXISTS "Users can insert their own relay frames" ON public.relay_frames;
DROP POLICY IF EXISTS "Users can update their own relay frames" ON public.relay_frames;
DROP POLICY IF EXISTS "Users can delete their own relay frames" ON public.relay_frames;

-- Recreate policies using requesting_user_id() for consistency
CREATE POLICY "Users can view their own relay frames"
ON public.relay_frames
FOR SELECT
TO authenticated
USING (host_id = requesting_user_id());

CREATE POLICY "Users can insert their own relay frames"
ON public.relay_frames
FOR INSERT
TO authenticated
WITH CHECK (host_id = requesting_user_id());

CREATE POLICY "Users can update their own relay frames"
ON public.relay_frames
FOR UPDATE
TO authenticated
USING (host_id = requesting_user_id());

CREATE POLICY "Users can delete their own relay frames"
ON public.relay_frames
FOR DELETE
TO authenticated
USING (host_id = requesting_user_id());
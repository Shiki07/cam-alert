-- Fix security issue: Update function with proper search_path
CREATE OR REPLACE FUNCTION public.update_motion_event_cleared(
  event_id UUID,
  cleared_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.motion_events 
  SET 
    cleared_at = cleared_timestamp,
    duration_ms = EXTRACT(EPOCH FROM (cleared_timestamp - detected_at)) * 1000
  WHERE id = event_id AND user_id = auth.uid();
END;
$$;
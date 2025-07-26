-- Create function to update motion event when cleared
CREATE OR REPLACE FUNCTION update_motion_event_cleared(event_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE motion_events 
  SET 
    cleared_at = now(),
    duration_ms = EXTRACT(EPOCH FROM (now() - detected_at)) * 1000
  WHERE id = event_id;
END;
$$;
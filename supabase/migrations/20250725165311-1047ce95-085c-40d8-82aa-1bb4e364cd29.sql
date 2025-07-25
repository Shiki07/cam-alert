-- Create a table for motion events
CREATE TABLE public.motion_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  motion_level REAL NOT NULL,
  duration_ms INTEGER,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cleared_at TIMESTAMP WITH TIME ZONE,
  recording_triggered BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  detection_zone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.motion_events ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own motion events" 
ON public.motion_events 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own motion events" 
ON public.motion_events 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own motion events" 
ON public.motion_events 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own motion events" 
ON public.motion_events 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for faster queries
CREATE INDEX idx_motion_events_user_detected_at ON public.motion_events(user_id, detected_at DESC);

-- Create function to update cleared_at and calculate duration
CREATE OR REPLACE FUNCTION public.update_motion_event_cleared(
  event_id UUID,
  cleared_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.motion_events 
  SET 
    cleared_at = cleared_timestamp,
    duration_ms = EXTRACT(EPOCH FROM (cleared_timestamp - detected_at)) * 1000
  WHERE id = event_id AND user_id = auth.uid();
END;
$$;
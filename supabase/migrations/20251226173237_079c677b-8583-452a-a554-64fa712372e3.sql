-- Create the relay_frames table for camera streaming relay
CREATE TABLE public.relay_frames (
  room_id TEXT PRIMARY KEY,
  frame TEXT NOT NULL,
  host_id UUID NOT NULL,
  host_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.relay_frames ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view frames from their own streams (as host or viewer of their rooms)
CREATE POLICY "Users can view their own relay frames"
ON public.relay_frames
FOR SELECT
USING (host_id = auth.uid());

-- Policy: Users can insert their own relay frames
CREATE POLICY "Users can insert their own relay frames"
ON public.relay_frames
FOR INSERT
WITH CHECK (host_id = auth.uid());

-- Policy: Users can update their own relay frames
CREATE POLICY "Users can update their own relay frames"
ON public.relay_frames
FOR UPDATE
USING (host_id = auth.uid());

-- Policy: Users can delete their own relay frames
CREATE POLICY "Users can delete their own relay frames"
ON public.relay_frames
FOR DELETE
USING (host_id = auth.uid());

-- Create index for faster lookups
CREATE INDEX idx_relay_frames_updated_at ON public.relay_frames(updated_at);
CREATE INDEX idx_relay_frames_host_id ON public.relay_frames(host_id);
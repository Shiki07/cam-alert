
-- Create a table to store video/image metadata
CREATE TABLE public.recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('video', 'image')),
  storage_type TEXT NOT NULL CHECK (storage_type IN ('cloud', 'local')),
  file_path TEXT NOT NULL,
  file_size BIGINT,
  duration_seconds INTEGER,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  motion_detected BOOLEAN DEFAULT false,
  thumbnail_path TEXT
);

-- Enable RLS
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own recordings" 
  ON public.recordings 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own recordings" 
  ON public.recordings 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recordings" 
  ON public.recordings 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recordings" 
  ON public.recordings 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Create storage bucket for cloud recordings
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recordings', 'recordings', false);

-- Storage policies for recordings bucket
CREATE POLICY "Users can upload their own recordings" 
  ON storage.objects 
  FOR INSERT 
  WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own recordings" 
  ON storage.objects 
  FOR SELECT 
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own recordings" 
  ON storage.objects 
  FOR DELETE 
  USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

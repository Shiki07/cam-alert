-- Create storage buckets for recordings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES 
  ('camera-recordings', 'camera-recordings', false, 104857600, ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png']),
  ('camera-thumbnails', 'camera-thumbnails', false, 10485760, ARRAY['image/jpeg', 'image/png']);

-- Create storage policies for camera recordings
CREATE POLICY "Users can view their own recordings" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'camera-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload their own recordings" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'camera-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own recordings" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'camera-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own recordings" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'camera-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create storage policies for camera thumbnails
CREATE POLICY "Users can view their own thumbnails" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'camera-thumbnails' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload their own thumbnails" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'camera-thumbnails' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own thumbnails" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'camera-thumbnails' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own thumbnails" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'camera-thumbnails' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add storage settings to user profiles (create user_settings table)
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_type TEXT NOT NULL DEFAULT 'cloud' CHECK (storage_type IN ('cloud', 'local')),
  recording_quality TEXT NOT NULL DEFAULT 'medium' CHECK (recording_quality IN ('high', 'medium', 'low')),
  max_storage_gb INTEGER NOT NULL DEFAULT 5,
  auto_delete_days INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on user_settings
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for user_settings
CREATE POLICY "Users can view their own settings" 
ON public.user_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" 
ON public.user_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" 
ON public.user_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates on user_settings
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Update recordings table to track storage location and file paths
ALTER TABLE public.recordings 
ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
ADD COLUMN IF NOT EXISTS local_file_path TEXT,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
-- Create a table to store OAuth tokens securely
CREATE TABLE public.cloud_storage_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL, -- 'google_drive', 'onedrive', 'dropbox', 's3'
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  provider_metadata JSONB, -- For S3: bucket, region; For others: folder IDs, etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable Row Level Security
ALTER TABLE public.cloud_storage_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own tokens
CREATE POLICY "Users can view their own tokens"
ON public.cloud_storage_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tokens"
ON public.cloud_storage_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tokens"
ON public.cloud_storage_tokens
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tokens"
ON public.cloud_storage_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_cloud_storage_tokens_updated_at
BEFORE UPDATE ON public.cloud_storage_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
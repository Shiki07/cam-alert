-- Drop the cloud_storage_tokens table and its policies
DROP TRIGGER IF EXISTS update_cloud_storage_tokens_updated_at ON public.cloud_storage_tokens;
DROP POLICY IF EXISTS "Users can view their own tokens" ON public.cloud_storage_tokens;
DROP POLICY IF EXISTS "Users can insert their own tokens" ON public.cloud_storage_tokens;
DROP POLICY IF EXISTS "Users can update their own tokens" ON public.cloud_storage_tokens;
DROP POLICY IF EXISTS "Users can delete their own tokens" ON public.cloud_storage_tokens;
DROP TABLE IF EXISTS public.cloud_storage_tokens;
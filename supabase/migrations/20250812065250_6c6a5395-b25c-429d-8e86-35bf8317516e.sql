-- Phase 1: Critical DB security fixes
-- 1) Drop unsafe overloaded function without user check
DROP FUNCTION IF EXISTS public.update_motion_event_cleared(uuid);

-- 2) Helper function for updated_at timestamps (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Secure storage for camera credentials (metadata only; secret handled in Edge Function)
CREATE TABLE IF NOT EXISTS public.camera_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  camera_label text NOT NULL,
  scheme text NOT NULL DEFAULT 'http',
  host text NOT NULL,
  port integer NOT NULL DEFAULT 80,
  path text NOT NULL DEFAULT '/',
  username text,
  password_ciphertext text, -- encrypted client/edge-side; never store plaintext
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT camera_credentials_scheme_chk CHECK (scheme IN ('http','https')),
  CONSTRAINT camera_credentials_port_chk CHECK (port > 0 AND port < 65536)
);

-- Uniqueness to prevent label collisions per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_camera_credentials_user_label
  ON public.camera_credentials (user_id, camera_label);

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_camera_credentials_updated_at'
  ) THEN
    CREATE TRIGGER trg_camera_credentials_updated_at
    BEFORE UPDATE ON public.camera_credentials
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Enable RLS and add strict policies (authenticated only)
ALTER TABLE public.camera_credentials ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent names)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='camera_credentials' AND policyname='Users can view their own camera credentials') THEN
    DROP POLICY "Users can view their own camera credentials" ON public.camera_credentials;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='camera_credentials' AND policyname='Users can insert their own camera credentials') THEN
    DROP POLICY "Users can insert their own camera credentials" ON public.camera_credentials;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='camera_credentials' AND policyname='Users can update their own camera credentials') THEN
    DROP POLICY "Users can update their own camera credentials" ON public.camera_credentials;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='camera_credentials' AND policyname='Users can delete their own camera credentials') THEN
    DROP POLICY "Users can delete their own camera credentials" ON public.camera_credentials;
  END IF;
END $$;

CREATE POLICY "Users can view their own camera credentials"
  ON public.camera_credentials
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own camera credentials"
  ON public.camera_credentials
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own camera credentials"
  ON public.camera_credentials
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own camera credentials"
  ON public.camera_credentials
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4) Tighten existing table policies to authenticated role
-- motion_events
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='motion_events' AND policyname='Users can view their own motion events') THEN
    DROP POLICY "Users can view their own motion events" ON public.motion_events;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='motion_events' AND policyname='Users can create their own motion events') THEN
    DROP POLICY "Users can create their own motion events" ON public.motion_events;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='motion_events' AND policyname='Users can update their own motion events') THEN
    DROP POLICY "Users can update their own motion events" ON public.motion_events;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='motion_events' AND policyname='Users can delete their own motion events') THEN
    DROP POLICY "Users can delete their own motion events" ON public.motion_events;
  END IF;
END $$;

CREATE POLICY "Users can view their own motion events"
  ON public.motion_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own motion events"
  ON public.motion_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own motion events"
  ON public.motion_events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own motion events"
  ON public.motion_events
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- recordings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recordings' AND policyname='Users can view their own recordings') THEN
    DROP POLICY "Users can view their own recordings" ON public.recordings;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recordings' AND policyname='Users can create their own recordings') THEN
    DROP POLICY "Users can create their own recordings" ON public.recordings;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recordings' AND policyname='Users can update their own recordings') THEN
    DROP POLICY "Users can update their own recordings" ON public.recordings;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recordings' AND policyname='Users can delete their own recordings') THEN
    DROP POLICY "Users can delete their own recordings" ON public.recordings;
  END IF;
END $$;

CREATE POLICY "Users can view their own recordings"
  ON public.recordings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own recordings"
  ON public.recordings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recordings"
  ON public.recordings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recordings"
  ON public.recordings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can view their own profile') THEN
    DROP POLICY "Users can view their own profile" ON public.profiles;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can insert their own profile') THEN
    DROP POLICY "Users can insert their own profile" ON public.profiles;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can update their own profile') THEN
    DROP POLICY "Users can update their own profile" ON public.profiles;
  END IF;
END $$;

CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

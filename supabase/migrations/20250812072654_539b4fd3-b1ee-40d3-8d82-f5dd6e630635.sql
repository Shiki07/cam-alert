
-- Ensure RLS is enabled (idempotent)
alter table public.camera_credentials enable row level security;
alter table public.motion_events enable row level security;
alter table public.profiles enable row level security;
alter table public.recordings enable row level security;
alter table storage.objects enable row level security;

-- CAMERA CREDENTIALS
drop policy if exists "Authenticated users can delete their own camera credentials" on public.camera_credentials;
drop policy if exists "Authenticated users can update their own camera credentials" on public.camera_credentials;
drop policy if exists "Authenticated users can view their own camera credentials" on public.camera_credentials;
drop policy if exists "Authenticated users can insert their own camera credentials" on public.camera_credentials;

create policy "Authenticated users can view their own camera credentials"
  on public.camera_credentials
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can insert their own camera credentials"
  on public.camera_credentials
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated users can update their own camera credentials"
  on public.camera_credentials
  for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can delete their own camera credentials"
  on public.camera_credentials
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- MOTION EVENTS
drop policy if exists "Authenticated users can delete their own motion events" on public.motion_events;
drop policy if exists "Authenticated users can update their own motion events" on public.motion_events;
drop policy if exists "Authenticated users can view their own motion events" on public.motion_events;
drop policy if exists "Authenticated users can create their own motion events" on public.motion_events;

create policy "Authenticated users can view their own motion events"
  on public.motion_events
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can create their own motion events"
  on public.motion_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated users can update their own motion events"
  on public.motion_events
  for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can delete their own motion events"
  on public.motion_events
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- PROFILES
drop policy if exists "Authenticated users can update their own profile" on public.profiles;
drop policy if exists "Authenticated users can view their own profile" on public.profiles;
drop policy if exists "Authenticated users can insert their own profile" on public.profiles;

create policy "Authenticated users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Authenticated users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Authenticated users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id);

-- RECORDINGS
drop policy if exists "Authenticated users can delete their own recordings" on public.recordings;
drop policy if exists "Authenticated users can update their own recordings" on public.recordings;
drop policy if exists "Authenticated users can view their own recordings" on public.recordings;
drop policy if exists "Authenticated users can create their own recordings" on public.recordings;

create policy "Authenticated users can view their own recordings"
  on public.recordings
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can create their own recordings"
  on public.recordings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated users can update their own recordings"
  on public.recordings
  for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can delete their own recordings"
  on public.recordings
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- STORAGE POLICIES FOR `recordings` BUCKET
-- Remove previously created policies (names may vary)
drop policy if exists "Authenticated users can view their own recordings" on storage.objects;
drop policy if exists "Authenticated users can upload their own recordings" on storage.objects;
drop policy if exists "Authenticated users can update their own recordings" on storage.objects;
drop policy if exists "Authenticated users can delete their own recordings" on storage.objects;

-- Recreate with explicit 'to authenticated' and bucket/owner checks
create policy "Users can view their own recording files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recordings'
    and owner = auth.uid()
  );

create policy "Users can upload their own recording files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'recordings'
    and owner = auth.uid()
  );

create policy "Users can update their own recording files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'recordings'
    and owner = auth.uid()
  )
  with check (
    bucket_id = 'recordings'
    and owner = auth.uid()
  );

create policy "Users can delete their own recording files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'recordings'
    and owner = auth.uid()
  );

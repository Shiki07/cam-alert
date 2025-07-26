-- Add Pi storage configuration to recordings table
ALTER TABLE recordings 
ADD COLUMN pi_sync_status text DEFAULT 'pending',
ADD COLUMN pi_sync_error text,
ADD COLUMN pi_synced_at timestamp with time zone;

-- Create an index for efficient querying of unsynced recordings
CREATE INDEX idx_recordings_pi_sync ON recordings(pi_sync_status, recorded_at) 
WHERE pi_sync_status IN ('pending', 'failed');
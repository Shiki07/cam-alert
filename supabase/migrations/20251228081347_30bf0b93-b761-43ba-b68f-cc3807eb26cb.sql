-- Delete all objects in the recordings bucket first, then delete the bucket
DELETE FROM storage.objects WHERE bucket_id = 'recordings';
DELETE FROM storage.buckets WHERE id = 'recordings';
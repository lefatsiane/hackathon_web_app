-- Profile images are private objects. The API authorizes each operation using
-- the profile's auth_user_id and issues short-lived Storage signed URLs.
BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS avatar_path text;

ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS avatar_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Deliberately do not add Storage object policies. Browser and mobile clients
-- receive only short-lived signed URLs from the ownership-checked Express API.

COMMIT;
-- CV files are private objects. The API authorizes uploads by profile ownership
-- and gates downloads on the candidate's own privacy setting, then issues
-- short-lived Storage signed URLs, mirroring the 006_profile_media.sql avatar pattern.
BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS cv_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cvs',
  'cvs',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Deliberately do not add Storage object policies. Browser clients receive
-- only short-lived signed URLs from the ownership/permission-checked Express API.

COMMIT;

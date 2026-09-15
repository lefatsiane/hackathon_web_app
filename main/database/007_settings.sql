-- Adds a private per-user preferences store and a student contact phone field
-- so the settings page has real, ownership-scoped data to read and write.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_settings (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('dark', 'light', 'system')),
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role client (Express API) reads or writes
-- this table, matching the private-data pattern used elsewhere in this project.

DROP TRIGGER IF EXISTS user_settings_set_updated_at ON public.user_settings;
CREATE TRIGGER user_settings_set_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS phone text;

COMMIT;

-- Stores the one-time networking brief generated when a mutual swipe match is created.
BEGIN;

ALTER TABLE public.swipe_matches
  ADD COLUMN IF NOT EXISTS connection_advice jsonb;

COMMIT;

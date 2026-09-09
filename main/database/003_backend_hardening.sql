BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_set_updated_at ON public.students;
CREATE TRIGGER students_set_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS employers_set_updated_at ON public.employers;
CREATE TRIGGER employers_set_updated_at
BEFORE UPDATE ON public.employers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS opportunities_set_updated_at ON public.opportunities;
CREATE TRIGGER opportunities_set_updated_at
BEFORE UPDATE ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Normalize legacy skill arrays without changing their text-array contract.
UPDATE public.students
SET skills = COALESCE(
  (
    SELECT array_agg(skill ORDER BY first_seen)
    FROM (
            SELECT lower(regexp_replace(btrim(raw_skill), '\s+', ' ', 'g')) AS skill,
             min(position) AS first_seen
            FROM unnest(COALESCE(public.students.skills, '{}'::text[])) WITH ORDINALITY AS skill_values(raw_skill, position)
      WHERE btrim(raw_skill) <> ''
            GROUP BY lower(regexp_replace(btrim(raw_skill), '\s+', ' ', 'g'))
    ) AS normalized
  ),
  '{}'::text[]
);

UPDATE public.opportunities
SET required_skills = COALESCE(
  (
    SELECT array_agg(skill ORDER BY first_seen)
    FROM (
            SELECT lower(regexp_replace(btrim(raw_skill), '\s+', ' ', 'g')) AS skill,
             min(position) AS first_seen
            FROM unnest(COALESCE(public.opportunities.required_skills, '{}'::text[])) WITH ORDINALITY AS skill_values(raw_skill, position)
      WHERE btrim(raw_skill) <> ''
            GROUP BY lower(regexp_replace(btrim(raw_skill), '\s+', ' ', 'g'))
    ) AS normalized
  ),
  '{}'::text[]
),
preferred_skills = COALESCE(
  (
    SELECT array_agg(skill ORDER BY first_seen)
    FROM (
            SELECT lower(regexp_replace(btrim(raw_skill), '\s+', ' ', 'g')) AS skill,
             min(position) AS first_seen
            FROM unnest(COALESCE(public.opportunities.preferred_skills, '{}'::text[])) WITH ORDINALITY AS skill_values(raw_skill, position)
      WHERE btrim(raw_skill) <> ''
            GROUP BY lower(regexp_replace(btrim(raw_skill), '\s+', ' ', 'g'))
    ) AS normalized
  ),
  '{}'::text[]
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opportunities_nonnegative_salary_check'
  ) THEN
    ALTER TABLE public.opportunities
      ADD CONSTRAINT opportunities_nonnegative_salary_check
      CHECK ((salary_min IS NULL OR salary_min >= 0) AND (salary_max IS NULL OR salary_max >= 0));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS opportunities_public_listing_idx
  ON public.opportunities (status, archived_at, application_deadline, published_at DESC);

COMMIT;

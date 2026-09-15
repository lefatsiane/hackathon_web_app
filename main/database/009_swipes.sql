-- Persists private swipe decisions separately from computed AI compatibility.
BEGIN;

CREATE TABLE IF NOT EXISTS public.swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  swiper_role text NOT NULL CHECK (swiper_role IN ('student', 'employer')),
  decision text NOT NULL CHECK (decision IN ('like', 'pass')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, opportunity_id, swiper_role)
);

CREATE INDEX IF NOT EXISTS swipes_student_pair_idx
  ON public.swipes (student_id, opportunity_id);
CREATE INDEX IF NOT EXISTS swipes_opportunity_role_idx
  ON public.swipes (opportunity_id, swiper_role);
CREATE INDEX IF NOT EXISTS swipes_updated_at_idx
  ON public.swipes (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.swipe_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  matched_at timestamptz NOT NULL DEFAULT now(),
  student_deleted_at timestamptz,
  employer_deleted_at timestamptz,
  UNIQUE (student_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS swipe_matches_student_idx
  ON public.swipe_matches (student_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS swipe_matches_opportunity_idx
  ON public.swipe_matches (opportunity_id, matched_at DESC);

ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipe_matches ENABLE ROW LEVEL SECURITY;

-- Express uses the service-role client, while these policies protect the tables
-- if a browser client is ever granted a JWT-backed Supabase data path.
CREATE POLICY "Users may insert their own swipes"
  ON public.swipes FOR INSERT
  TO authenticated
  WITH CHECK (
    (swiper_role = 'student' AND EXISTS (
      SELECT 1 FROM public.students
      WHERE students.id = swipes.student_id
        AND students.auth_user_id = auth.uid()
    ))
    OR
    (swiper_role = 'employer' AND EXISTS (
      SELECT 1
      FROM public.opportunities
      JOIN public.employers ON employers.id = opportunities.employer_id
      WHERE opportunities.id = swipes.opportunity_id
        AND employers.auth_user_id = auth.uid()
    ))
  );

CREATE POLICY "Match participants may read their connections"
  ON public.swipe_matches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students
      WHERE students.id = swipe_matches.student_id
        AND students.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.opportunities
      JOIN public.employers ON employers.id = opportunities.employer_id
      WHERE opportunities.id = swipe_matches.opportunity_id
        AND employers.auth_user_id = auth.uid()
    )
  );

COMMIT;

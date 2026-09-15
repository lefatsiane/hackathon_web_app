-- Adds student-to-student networking without changing employer opportunity matches.
BEGIN;

CREATE TABLE IF NOT EXISTS public.peer_swipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  target_student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('like', 'pass')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (swiper_student_id <> target_student_id),
  UNIQUE (swiper_student_id, target_student_id)
);

CREATE INDEX IF NOT EXISTS peer_swipes_target_idx
  ON public.peer_swipes (target_student_id, decision);
CREATE INDEX IF NOT EXISTS peer_swipes_updated_at_idx
  ON public.peer_swipes (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.student_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_a_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_b_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  matched_at timestamptz NOT NULL DEFAULT now(),
  connection_advice jsonb,
  student_a_deleted_at timestamptz,
  student_b_deleted_at timestamptz,
  CHECK (student_a_id <> student_b_id),
  CHECK (student_a_id < student_b_id),
  UNIQUE (student_a_id, student_b_id)
);

CREATE INDEX IF NOT EXISTS student_matches_a_idx
  ON public.student_matches (student_a_id, matched_at DESC);
CREATE INDEX IF NOT EXISTS student_matches_b_idx
  ON public.student_matches (student_b_id, matched_at DESC);

ALTER TABLE public.peer_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students may insert their own peer swipes"
  ON public.peer_swipes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students
      WHERE students.id = peer_swipes.swiper_student_id
        AND students.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Peer match participants may read connections"
  ON public.student_matches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students
      WHERE students.id = student_matches.student_a_id
        AND students.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.students
      WHERE students.id = student_matches.student_b_id
        AND students.auth_user_id = auth.uid()
    )
  );

COMMIT;

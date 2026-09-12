-- 004_notifications.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  type text not null default 'job_posted',
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS notifications_student_id_idx ON public.notifications (student_id);
CREATE INDEX IF NOT EXISTS notifications_student_unread_idx ON public.notifications (student_id, is_read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifications are publicly readable"
  ON public.notifications FOR SELECT
  USING (true);

COMMIT;
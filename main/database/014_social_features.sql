-- 014_social_features.sql — lecturers, events, messaging, notifications, admin settings
BEGIN;

CREATE TABLE IF NOT EXISTS public.lecturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  institution text,
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lecturers_auth_user_id_idx ON public.lecturers(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'Other',
  location text,
  mode text CHECK (mode IN ('onsite','online','hybrid')),
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  external_link text,
  created_by_role text CHECK (created_by_role IN ('lecturer','employer','admin')),
  created_by_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_start_time_idx ON public.events (start_time);
CREATE INDEX IF NOT EXISTS events_type_idx ON public.events (event_type);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a_role text NOT NULL CHECK (participant_a_role IN ('student','employer','lecturer')),
  participant_a_id uuid NOT NULL,
  participant_b_role text NOT NULL CHECK (participant_b_role IN ('student','employer','lecturer')),
  participant_b_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_a_role, participant_a_id, participant_b_role, participant_b_id)
);
CREATE INDEX IF NOT EXISTS conversations_a_idx ON public.conversations (participant_a_role, participant_a_id);
CREATE INDEX IF NOT EXISTS conversations_b_idx ON public.conversations (participant_b_role, participant_b_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_role text NOT NULL,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_role text NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_role, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lecturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are publicly readable" ON public.events FOR SELECT USING (true);
CREATE POLICY "Lecturers are publicly readable" ON public.lecturers FOR SELECT USING (true);
CREATE POLICY "Participants may read their conversations" ON public.conversations FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.students  WHERE students.id  = participant_a_id AND students.auth_user_id  = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employers WHERE employers.id = participant_a_id AND employers.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.lecturers WHERE lecturers.id = participant_a_id AND lecturers.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.students  WHERE students.id  = participant_b_id AND students.auth_user_id  = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employers WHERE employers.id = participant_b_id AND employers.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.lecturers WHERE lecturers.id = participant_b_id AND lecturers.auth_user_id = auth.uid())
  );
CREATE POLICY "Users may read their own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.students  WHERE students.id  = user_id AND students.auth_user_id  = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employers WHERE employers.id = user_id AND employers.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.lecturers WHERE lecturers.id = user_id AND lecturers.auth_user_id = auth.uid())
  );

COMMIT;

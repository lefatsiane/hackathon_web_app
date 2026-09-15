-- ============================================================
-- GRADURAT
-- Student Email Verification
-- ============================================================

alter table public.students
add column if not exists university_email text;

alter table public.students
add column if not exists university_email_verified boolean
not null default false;

alter table public.students
add column if not exists university_email_verified_at timestamptz;

alter table public.students
add column if not exists verification_code_hash text;

alter table public.students
add column if not exists verification_code_expires_at timestamptz;

alter table public.students
add column if not exists verification_attempts integer
not null default 0;

alter table public.students
add column if not exists verification_requested_at timestamptz;


-- Make sure verification attempts can never be negative.

alter table public.students
add constraint students_verification_attempts_check
check (verification_attempts >= 0);


-- Index for looking students up by university email.

create index if not exists students_university_email_idx
on public.students (university_email);


-- Index for finding verified students.

create index if not exists students_university_email_verified_idx
on public.students (university_email_verified);

-- Applications are intentionally separate from external application links so the
-- platform can track student interest without pretending to replace an employer's
-- hiring system.

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  cover_note text,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, opportunity_id),
  constraint applications_status_check check (status in ('submitted', 'reviewing', 'shortlisted', 'rejected', 'withdrawn'))
);

create index if not exists applications_student_idx
  on public.applications (student_id, created_at desc);
create index if not exists applications_opportunity_idx
  on public.applications (opportunity_id, status, created_at desc);

alter table public.applications enable row level security;

create policy "Applications are publicly readable"
  on public.applications for select
  using (true);

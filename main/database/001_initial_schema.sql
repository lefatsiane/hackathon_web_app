-- PostgreSQL is used through Supabase because it supplies relational constraints,
-- array support for skills, indexes, and row-level security in one managed service.
-- This first migration creates the compact core model used by the API.

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  skills text[] not null default '{}',
  bio text,
  created_at timestamptz not null default now()
);

create table if not exists public.employers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  email text not null unique,
  bio text,
  website text,
  created_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  employer_id uuid not null references public.employers(id) on delete cascade,
  description text,
  required_skills text[] not null default '{}',
  type text,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  match_score numeric(5, 2) not null check (match_score >= 0 and match_score <= 100),
  reasoning text not null,
  created_at timestamptz not null default now(),
  unique (student_id, opportunity_id)
);

create index if not exists matches_student_id_idx on public.matches(student_id);
create index if not exists matches_opportunity_id_idx on public.matches(opportunity_id);
create index if not exists matches_score_idx on public.matches(match_score desc);

alter table public.students enable row level security;
alter table public.employers enable row level security;
alter table public.opportunities enable row level security;
alter table public.matches enable row level security;

-- Public reads support the prototype's open marketplace. Server writes use the
-- service-role client and therefore stay outside the browser's trust boundary.
create policy "Students are publicly readable"
  on public.students for select
  using (true);

create policy "Employers are publicly readable"
  on public.employers for select
  using (true);

create policy "Opportunities are publicly readable"
  on public.opportunities for select
  using (true);

create policy "Matches are publicly readable"
  on public.matches for select
  using (true);

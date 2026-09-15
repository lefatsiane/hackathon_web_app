alter table public.students
  add column if not exists auth_user_id uuid
  references auth.users(id) on delete cascade;

alter table public.employers
  add column if not exists auth_user_id uuid
  references auth.users(id) on delete cascade;

create unique index if not exists students_auth_user_id_idx
  on public.students(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists employers_auth_user_id_idx
  on public.employers(auth_user_id)
  where auth_user_id is not null;
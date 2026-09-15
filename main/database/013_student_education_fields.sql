alter table public.students
  add column if not exists institution text,
  add column if not exists field_of_study text;
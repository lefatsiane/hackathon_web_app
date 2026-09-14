-- Employers may privately arrange applicants for their own opportunity view.
-- Public viewers continue to receive applicants in application order.

alter table public.applications
  add column if not exists display_order integer;

create index if not exists applications_opportunity_display_order_idx
  on public.applications (opportunity_id, display_order, created_at);

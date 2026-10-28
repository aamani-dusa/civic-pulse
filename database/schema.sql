-- CivicPulse database schema
-- Run this script in Supabase Dashboard -> SQL Editor.
-- RLS is enabled and no direct client policies are added. The Express backend
-- uses a server-only secret key and performs authorization before admin changes.

create extension if not exists pgcrypto;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Pothole', 'Water leakage', 'Overflowing garbage', 'Broken streetlight', 'Other')),
  location text not null check (char_length(trim(location)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 1000),
  severity text not null default 'Medium' check (severity in ('Low', 'Medium', 'High')),
  status text not null default 'Reported' check (status in ('Reported', 'Under review', 'Resolved')),
  reporter_name text null check (reporter_name is null or char_length(reporter_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_category_idx on public.reports (category);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_location_lower_idx on public.reports (lower(location));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_reports_updated_at on public.reports;
create trigger set_reports_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

alter table public.reports enable row level security;

-- Intentionally no anon/authenticated policies: browser clients cannot query
-- this table directly. All data access passes through the Express API.
-- Do not add a service-role key to frontend files.

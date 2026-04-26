create extension if not exists pgcrypto;

create table if not exists public.attempt_summaries (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_attempt_id text,
  created_at timestamptz not null,
  source text not null check (source in ('upload', 'live')),
  drill_id text,
  drill_version text,
  drill_title text not null,
  movement_type text not null check (movement_type in ('REP', 'HOLD', 'unknown')),
  duration_seconds numeric,
  reps_counted integer,
  reps_incomplete integer,
  longest_hold_seconds numeric,
  total_hold_seconds numeric,
  common_failure_reason text,
  main_finding text,
  status text not null check (status in ('completed', 'partial', 'failed', 'degraded')),
  analysis_model_version text not null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attempt_summaries_owner_created_idx on public.attempt_summaries (owner_user_id, created_at desc);
create index if not exists attempt_summaries_owner_drill_created_idx on public.attempt_summaries (owner_user_id, drill_id, created_at desc);
create unique index if not exists attempt_summaries_owner_client_attempt_idx
  on public.attempt_summaries (owner_user_id, client_attempt_id)
  where client_attempt_id is not null;

alter table public.attempt_summaries enable row level security;

create policy "attempt_summaries_owner_select" on public.attempt_summaries
for select using (auth.uid() = owner_user_id);

create policy "attempt_summaries_owner_insert" on public.attempt_summaries
for insert with check (auth.uid() = owner_user_id);

create policy "attempt_summaries_owner_update" on public.attempt_summaries
for update using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "attempt_summaries_owner_delete" on public.attempt_summaries
for delete using (auth.uid() = owner_user_id);

create or replace function public.set_attempt_summary_owner_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is null then
    new.owner_user_id := auth.uid();
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_set_attempt_summary_owner on public.attempt_summaries;
create trigger trg_set_attempt_summary_owner
before insert or update on public.attempt_summaries
for each row execute function public.set_attempt_summary_owner_from_auth();

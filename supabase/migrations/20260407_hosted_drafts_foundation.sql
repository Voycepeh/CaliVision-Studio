create extension if not exists pgcrypto;

create table if not exists public.hosted_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text not null default '',
  status text not null default 'draft',
  package_id text not null,
  package_version text not null,
  schema_version text not null,
  revision integer not null default 1,
  content jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists hosted_drafts_owner_package_idx on public.hosted_drafts (owner_user_id, package_id, package_version);

alter table public.hosted_drafts enable row level security;

create policy "hosted_drafts_owner_select" on public.hosted_drafts
for select using (auth.uid() = owner_user_id);

create policy "hosted_drafts_owner_insert" on public.hosted_drafts
for insert with check (auth.uid() = owner_user_id);

create policy "hosted_drafts_owner_update" on public.hosted_drafts
for update using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "hosted_drafts_owner_delete" on public.hosted_drafts
for delete using (auth.uid() = owner_user_id);

create or replace function public.set_hosted_draft_owner_from_auth()
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

drop trigger if exists trg_set_hosted_draft_owner on public.hosted_drafts;
create trigger trg_set_hosted_draft_owner
before insert or update on public.hosted_drafts
for each row execute function public.set_hosted_draft_owner_from_auth();

insert into storage.buckets (id, name, public)
values ('draft-assets', 'draft-assets', false)
on conflict (id) do nothing;

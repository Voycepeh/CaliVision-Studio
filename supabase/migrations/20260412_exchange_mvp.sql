create table if not exists public.exchange_publications (
  id uuid primary key default gen_random_uuid(),
  source_drill_id text not null,
  source_version_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  creator_display_name text not null,
  title text not null,
  slug text not null,
  short_description text not null,
  full_description text,
  movement_type text not null,
  camera_view text not null,
  difficulty_level text not null,
  category text not null,
  equipment text,
  tags text[] not null default '{}',
  visibility text not null default 'public',
  snapshot_package jsonb not null,
  published_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  fork_count integer not null default 0,
  is_active boolean not null default true
);

drop index if exists public.exchange_publications_owner_drill_idx;
create unique index if not exists exchange_publications_owner_source_version_idx on public.exchange_publications (owner_user_id, source_version_id);
create unique index if not exists exchange_publications_slug_idx on public.exchange_publications (slug);
create index if not exists exchange_publications_source_version_idx on public.exchange_publications (source_version_id);
create index if not exists exchange_publications_discovery_idx on public.exchange_publications (is_active, visibility, published_at desc);

create table if not exists public.exchange_forks (
  id uuid primary key default gen_random_uuid(),
  published_drill_id uuid not null references public.exchange_publications(id) on delete cascade,
  forked_private_drill_id text not null,
  forked_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists exchange_forks_published_drill_idx on public.exchange_forks (published_drill_id);
create index if not exists exchange_forks_forked_by_user_idx on public.exchange_forks (forked_by_user_id, created_at desc);
create unique index if not exists exchange_forks_user_publication_unique_idx on public.exchange_forks (published_drill_id, forked_by_user_id);

alter table public.exchange_publications enable row level security;
alter table public.exchange_forks enable row level security;

create policy "exchange_publications_public_select" on public.exchange_publications
for select using (visibility = 'public' and is_active = true);

create policy "exchange_publications_owner_select" on public.exchange_publications
for select using (auth.uid() = owner_user_id);

create policy "exchange_publications_owner_insert" on public.exchange_publications
for insert with check (auth.uid() = owner_user_id);

create policy "exchange_publications_owner_update" on public.exchange_publications
for update using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "exchange_publications_owner_delete" on public.exchange_publications
for delete using (auth.uid() = owner_user_id);

create policy "exchange_forks_owner_select" on public.exchange_forks
for select using (auth.uid() = forked_by_user_id);

create policy "exchange_forks_owner_insert" on public.exchange_forks
for insert with check (auth.uid() = forked_by_user_id);

create or replace function public.increment_exchange_fork_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.exchange_publications
  set fork_count = fork_count + 1,
      updated_at = timezone('utc', now())
  where id = new.published_drill_id;
  return new;
end;
$$;

drop trigger if exists trg_set_exchange_publication_owner on public.exchange_publications;
create trigger trg_set_exchange_publication_owner
before insert or update on public.exchange_publications
for each row execute function public.set_owner_from_auth();

drop trigger if exists trg_increment_exchange_fork_count on public.exchange_forks;
create trigger trg_increment_exchange_fork_count
after insert on public.exchange_forks
for each row execute function public.increment_exchange_fork_count();

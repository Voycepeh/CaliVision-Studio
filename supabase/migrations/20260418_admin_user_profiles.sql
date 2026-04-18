create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '',
  provider text,
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  last_active_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_profiles_role_idx on public.user_profiles(role);
create index if not exists user_profiles_last_active_idx on public.user_profiles(last_active_at desc nulls last);

alter table public.user_profiles enable row level security;

create policy "user_profiles_owner_select" on public.user_profiles
for select using (auth.uid() = user_id);

create policy "user_profiles_owner_insert" on public.user_profiles
for insert with check (auth.uid() = user_id);

create policy "user_profiles_owner_update" on public.user_profiles
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.prevent_user_profile_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
    and auth.uid() = old.user_id
    and new.role is distinct from old.role then
    raise exception 'role is server-managed';
  end if;
  return new;
end;
$$;

create or replace function public.set_user_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_set_user_profile_updated_at on public.user_profiles;
create trigger trg_set_user_profile_updated_at
before update on public.user_profiles
for each row execute function public.set_user_profile_updated_at();

drop trigger if exists trg_prevent_user_profile_role_self_escalation on public.user_profiles;
create trigger trg_prevent_user_profile_role_self_escalation
before update on public.user_profiles
for each row execute function public.prevent_user_profile_role_self_escalation();

create or replace function public.is_exchange_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.user_profiles profile
      where profile.user_id = auth.uid()
        and profile.role in ('moderator', 'admin')
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'moderator')
    or lower(coalesce(auth.jwt() ->> 'role', '')) in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'exchange_moderator')::boolean, false),
    false
  );
$$;

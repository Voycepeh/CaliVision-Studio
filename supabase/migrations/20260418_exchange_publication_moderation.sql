alter table public.exchange_publications
  add column if not exists visibility_status text,
  add column if not exists moderation_reason text,
  add column if not exists moderated_by uuid references auth.users(id),
  add column if not exists moderated_at timestamptz;

update public.exchange_publications
set visibility_status = case
  when is_active = true and visibility = 'public' then 'published'
  when is_active = true then 'hidden'
  else 'archived'
end
where visibility_status is null;

alter table public.exchange_publications
  alter column visibility_status set default 'published',
  alter column visibility_status set not null;

alter table public.exchange_publications
  drop constraint if exists exchange_publications_visibility_status_check;

alter table public.exchange_publications
  add constraint exchange_publications_visibility_status_check
  check (visibility_status in ('published', 'hidden', 'archived', 'deleted'));

drop index if exists exchange_publications_discovery_idx;
create index if not exists exchange_publications_discovery_idx
  on public.exchange_publications (visibility_status, is_active, published_at desc);

create or replace function public.is_exchange_moderator()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'moderator')
    or lower(coalesce(auth.jwt() ->> 'role', '')) in ('admin', 'moderator')
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'exchange_moderator')::boolean, false),
    false
  );
$$;

drop policy if exists "exchange_publications_public_select" on public.exchange_publications;
create policy "exchange_publications_public_select" on public.exchange_publications
for select using (visibility_status = 'published' and is_active = true);

drop policy if exists "exchange_publications_owner_update" on public.exchange_publications;
create policy "exchange_publications_owner_update" on public.exchange_publications
for update using (
  auth.uid() = owner_user_id
  or public.is_exchange_moderator()
)
with check (
  (auth.uid() = owner_user_id and visibility_status in ('published', 'hidden', 'archived'))
  or public.is_exchange_moderator()
);

drop policy if exists "exchange_publications_owner_delete" on public.exchange_publications;
create policy "exchange_publications_moderator_delete" on public.exchange_publications
for delete using (public.is_exchange_moderator());

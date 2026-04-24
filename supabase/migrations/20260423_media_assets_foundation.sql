create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  kind text not null check (kind in ('image', 'video', 'thumbnail', 'overlay')),
  scope text not null check (scope in ('branding', 'drill', 'benchmark', 'session', 'generated')),
  owner_user_id uuid references auth.users(id) on delete set null,
  title text,
  alt_text text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  display_order integer not null default 0,
  tags jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint media_assets_bucket_path_unique unique (bucket, path),
  constraint media_assets_tags_array check (jsonb_typeof(tags) = 'array')
);

create index if not exists media_assets_scope_kind_idx on public.media_assets (scope, kind);
create index if not exists media_assets_homepage_idx on public.media_assets (scope, display_order, created_at) where scope = 'branding';

create or replace function public.set_media_asset_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  if tg_op = 'INSERT' and new.owner_user_id is null then
    new.owner_user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_media_asset_updated_at on public.media_assets;
create trigger trg_set_media_asset_updated_at
before insert or update on public.media_assets
for each row execute function public.set_media_asset_updated_at();

alter table public.media_assets enable row level security;

create policy "media_assets_public_branding_select" on public.media_assets
for select using (scope = 'branding' and kind = 'image' and is_public = true and is_active = true);

create policy "media_assets_moderator_select" on public.media_assets
for select using (
  exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role in ('moderator', 'admin')
  )
);

create policy "media_assets_moderator_insert" on public.media_assets
for insert with check (
  exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role in ('moderator', 'admin')
  )
);

create policy "media_assets_moderator_update" on public.media_assets
for update using (
  exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role in ('moderator', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role in ('moderator', 'admin')
  )
);

create policy "media_assets_moderator_delete" on public.media_assets
for delete using (
  exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role in ('moderator', 'admin')
  )
);

insert into storage.buckets (id, name, public)
values ('branding-assets', 'branding-assets', true)
on conflict (id) do update set public = excluded.public;

create policy "branding_assets_public_select" on storage.objects
for select using (bucket_id = 'branding-assets');

create policy "branding_assets_moderator_insert" on storage.objects
for insert with check (
  bucket_id = 'branding-assets'
  and exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role in ('moderator', 'admin')
  )
);

create policy "branding_assets_moderator_update" on storage.objects
for update using (
  bucket_id = 'branding-assets'
  and exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role in ('moderator', 'admin')
  )
)
with check (
  bucket_id = 'branding-assets'
  and exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role in ('moderator', 'admin')
  )
);

create policy "branding_assets_moderator_delete" on storage.objects
for delete using (
  bucket_id = 'branding-assets'
  and exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role in ('moderator', 'admin')
  )
);

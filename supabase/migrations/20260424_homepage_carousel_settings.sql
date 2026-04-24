create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value integer,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_settings_setting_value_bounds check (setting_value is null or (setting_value >= 0 and setting_value <= 86400))
);

create or replace function public.set_app_settings_updated_at()
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

drop trigger if exists trg_set_app_settings_updated_at on public.app_settings;
create trigger trg_set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_app_settings_updated_at();

alter table public.app_settings enable row level security;

create policy "app_settings_public_homepage_select" on public.app_settings
for select using (setting_key = 'homepage_branding_carousel_duration_seconds');

create policy "app_settings_moderator_manage" on public.app_settings
for all
using (
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

insert into public.app_settings (setting_key, setting_value)
values ('homepage_branding_carousel_duration_seconds', 7)
on conflict (setting_key) do nothing;

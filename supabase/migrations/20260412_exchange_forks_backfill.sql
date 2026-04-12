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

alter table public.exchange_forks enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exchange_forks'
      AND policyname = 'exchange_forks_owner_select'
  ) THEN
    CREATE POLICY "exchange_forks_owner_select" ON public.exchange_forks
      FOR SELECT USING (auth.uid() = forked_by_user_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'exchange_forks'
      AND policyname = 'exchange_forks_owner_insert'
  ) THEN
    CREATE POLICY "exchange_forks_owner_insert" ON public.exchange_forks
      FOR INSERT WITH CHECK (auth.uid() = forked_by_user_id);
  END IF;
END;
$$;

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

drop trigger if exists trg_increment_exchange_fork_count on public.exchange_forks;
create trigger trg_increment_exchange_fork_count
after insert on public.exchange_forks
for each row execute function public.increment_exchange_fork_count();

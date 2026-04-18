-- Canonical Drill Exchange publication identity is owner + drill (not owner + version).
-- This migration deduplicates existing publication rows, preserves fork references,
-- and enforces one publication row per owner/source drill.

with ranked_publications as (
  select
    ep.id,
    ep.owner_user_id,
    ep.source_drill_id,
    row_number() over (
      partition by ep.owner_user_id, ep.source_drill_id
      order by
        case when ep.visibility_status = 'published' and ep.is_active = true then 0 else 1 end,
        ep.updated_at desc,
        ep.published_at desc,
        ep.id desc
    ) as publication_rank
  from public.exchange_publications ep
),
canonical_publications as (
  select
    owner_user_id,
    source_drill_id,
    id as canonical_id
  from ranked_publications
  where publication_rank = 1
),
duplicate_publications as (
  select
    rp.id as duplicate_id,
    cp.canonical_id
  from ranked_publications rp
  join canonical_publications cp
    on cp.owner_user_id = rp.owner_user_id
   and cp.source_drill_id = rp.source_drill_id
  where rp.publication_rank > 1
),
forks_with_target as (
  select
    ef.id,
    coalesce(dp.canonical_id, ef.published_drill_id) as target_publication_id,
    ef.forked_by_user_id,
    ef.created_at
  from public.exchange_forks ef
  left join duplicate_publications dp on dp.duplicate_id = ef.published_drill_id
),
ranked_forks as (
  select
    id,
    row_number() over (
      partition by target_publication_id, forked_by_user_id
      order by created_at desc, id desc
    ) as fork_rank
  from forks_with_target
)
delete from public.exchange_forks
where id in (
  select id
  from ranked_forks
  where fork_rank > 1
);

with ranked_publications as (
  select
    ep.id,
    ep.owner_user_id,
    ep.source_drill_id,
    row_number() over (
      partition by ep.owner_user_id, ep.source_drill_id
      order by
        case when ep.visibility_status = 'published' and ep.is_active = true then 0 else 1 end,
        ep.updated_at desc,
        ep.published_at desc,
        ep.id desc
    ) as publication_rank
  from public.exchange_publications ep
),
canonical_publications as (
  select
    owner_user_id,
    source_drill_id,
    id as canonical_id
  from ranked_publications
  where publication_rank = 1
),
duplicate_publications as (
  select
    rp.id as duplicate_id,
    cp.canonical_id
  from ranked_publications rp
  join canonical_publications cp
    on cp.owner_user_id = rp.owner_user_id
   and cp.source_drill_id = rp.source_drill_id
  where rp.publication_rank > 1
)
update public.exchange_forks ef
set published_drill_id = dp.canonical_id
from duplicate_publications dp
where ef.published_drill_id = dp.duplicate_id;

with ranked_publications as (
  select
    ep.id,
    row_number() over (
      partition by ep.owner_user_id, ep.source_drill_id
      order by
        case when ep.visibility_status = 'published' and ep.is_active = true then 0 else 1 end,
        ep.updated_at desc,
        ep.published_at desc,
        ep.id desc
    ) as publication_rank
  from public.exchange_publications ep
)
delete from public.exchange_publications
where id in (
  select id
  from ranked_publications
  where publication_rank > 1
);

drop index if exists exchange_publications_owner_source_version_idx;
create unique index if not exists exchange_publications_owner_source_drill_idx
  on public.exchange_publications (owner_user_id, source_drill_id);

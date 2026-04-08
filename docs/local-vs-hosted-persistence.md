# Local-only vs signed-in hosted persistence

## Local-only behavior (guest or missing Supabase env)

- App remains fully usable.
- Draft editing stays browser-local (IndexedDB/local persistence).
- Hosted controls are hidden or disabled.

## Signed-in hosted behavior (Google auth)

- User signs in with Google through Supabase.
- Hosted versions are stored in `hosted_library` as the single active lifecycle store.
- Draft and Ready are version statuses (metadata), not separate storage buckets in UI.
- RLS policies ensure each user can only access their own hosted rows.

## Failure safety

If Supabase is unavailable, browser-local authoring remains available so Drill Studio workflows are not blocked.

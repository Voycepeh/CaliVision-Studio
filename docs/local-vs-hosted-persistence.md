# Local-only vs signed-in hosted persistence

## Local-only behavior (guest or missing Supabase env)

- App remains fully usable.
- Drafts and library data stay in browser-local persistence.
- Hosted controls are hidden or disabled.

## Signed-in hosted behavior (Google auth)

- User signs in with Google through Supabase.
- Hosted drafts/library become available under that user account.
- RLS policies ensure each user can only access their own hosted rows.

## Failure safety

If Supabase is unavailable, browser-local authoring remains available so Drill Studio workflows are not blocked.

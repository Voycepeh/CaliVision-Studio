# Hosted drafts (first backend slice)

Hosted drafts are user-owned, private drill drafts stored in Supabase.

## What a hosted draft includes

- hosted draft id
- owner user id
- title
- summary
- draft status
- package id/version/schema version
- revision/provenance-ready metadata
- content JSON used to restore Studio authoring state

## What this does not include yet

- public Drill Exchange retrieval
- full package publishing workflow
- collaboration/comments/social layers
- billing/moderation controls

Android runtime/live coaching remains outside Studio in https://github.com/Voycepeh/CaliVision.

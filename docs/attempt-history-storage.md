# Attempt history storage (Upload Video + Live Streaming)

## Current behavior (April 26, 2026)

Studio stores lightweight attempt summaries for completed **Upload Video** and **Live Streaming** runs.

- **Signed out:** summaries are saved only in this browser/device profile (local storage).
- **Signed in:** summaries are saved to the signed-in account through Supabase-hosted `attempt_summaries` rows.
- **No silent migration:** local history is not auto-uploaded when a user signs in.

## History list

The `/history` route is the training log entry point.

- Every attempt row is clickable and opens `/history/[attemptId]`.
- History rows stay compact and include a subtle **View details** affordance.
- Personal bests are shown by drill with movement-type-aware summaries:
  - REP drills show **Best reps** only.
  - HOLD drills show **Longest hold** only.
  - Unknown movement type shows **Latest attempt only**.

## Attempt detail

The `/history/[attemptId]` detail view shows lightweight summary metadata only:

- drill title,
- source (Upload Video or Live Streaming),
- date/time,
- status,
- movement type,
- key metric,
- REP metrics (reps counted + incomplete) when relevant,
- HOLD metrics (longest hold + total hold) when relevant,
- analyzed duration,
- main finding,
- common failure reason,
- analysis model version.

## Compare handoff

Attempt detail includes compare handoff CTAs to `/compare` with intent query params:

- `attemptId`,
- optional `drillId`,
- optional `compareTo=latest|personalBest`.

Compare reads and acknowledges this intent, then guides users to choose a second attempt or benchmark.

## Delete single attempt

Attempt detail includes a single-attempt delete action:

- **Signed out:** deletes from local browser history.
- **Signed in:** deletes from hosted account history.
- After delete, Studio returns to `/history`.

For hosted rows, lookup/delete handling remains safe for both non-UUID client attempt ids and hosted UUID row ids.

## Clear history

The History list retains clear-all behavior:

- signed out: **Clear local history**,
- signed in: **Clear account history**.

## Import local history to account (optional)

When signed in and local browser history exists, History shows optional import:

- **Import local history to account**.

Import behavior:

- uploads local summaries to hosted storage,
- uses local attempt id as `client_attempt_id` to prevent duplicates,
- does not silently delete local history after import.

## What is stored

Each attempt summary stores compact review metadata only:

- source (`upload` or `live`),
- created timestamp,
- drill id/version/title,
- movement type (`REP`, `HOLD`, or `unknown`),
- aggregate metrics (duration, reps counted/incomplete, longest/total hold),
- summary findings (`common_failure_reason`, `main_finding`),
- completion status (`completed`, `partial`, `failed`, `degraded`),
- analysis model version,
- optional `client_attempt_id` for duplicate-safe saves.

## What is not stored

Attempt history must stay lightweight. Studio does **not** persist these in attempt summary storage:

- raw uploaded/session videos,
- annotated replay videos,
- frame-level pose traces or heavy per-frame analysis artifacts.

## Privacy posture

- Attempt history is private by default.
- Hosted rows are owner-scoped through Supabase Row Level Security policies.
- Signed-out mode remains browser/device local.

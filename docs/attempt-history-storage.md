# Attempt history storage (Upload Video + Live Streaming)

## Current behavior (April 26, 2026)

Studio stores lightweight attempt summaries for completed **Upload Video** and **Live Streaming** runs.

- **Signed out:** summaries are saved only in this browser/device profile (local storage).
- **Signed in:** summaries are saved to the signed-in account through Supabase-hosted `attempt_summaries` rows.
- **No silent migration:** local history is not auto-uploaded when a user signs in.

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

## Import local history to account

When a user is signed in and local browser history exists, History shows an optional action:

- **Import local history to account**

Import behavior:

- uploads local summaries to hosted storage,
- uses local attempt id as `client_attempt_id` to prevent duplicates,
- does not silently delete local history after import.

## Privacy posture

- Attempt history is private by default.
- Hosted rows are owner-scoped through Supabase Row Level Security policies.
- Signed-out mode remains browser/device local.

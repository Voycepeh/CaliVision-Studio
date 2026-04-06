# Product Direction

## Ownership boundaries

### Studio (web) responsibilities

Studio is the long-term system of record for:
- full drill authoring,
- phase sequencing and timing,
- pose/canvas editing,
- package validation,
- package export,
- publish preparation and publish target orchestration.

### Mobile responsibilities (Android first, later iOS)

Mobile clients are runtime/live-coaching and drill consumption environments:
- load package payloads,
- execute drills during training,
- provide runtime cues and playback.

## PR9 direction: publish-first seams before hosted backend

PR9 intentionally ships:
- local/mock publish target implementation,
- publish-ready metadata placeholders,
- publish readiness checks,
- package locator abstraction for future hosted storage.

PR9 intentionally does **not** ship:
- auth,
- cloud storage,
- marketplace browsing,
- social interactions.

## Practical implication for PR sequencing

1. Lock and preserve portable package contracts.
2. Keep Studio authoring and export robust.
3. Add publish/storage abstraction seams.
4. Add local-first registry and marketplace UI groundwork.
5. Add hosted backend/auth/storage integration only after seams are stable.

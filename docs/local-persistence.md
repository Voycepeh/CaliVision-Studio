# Local Persistence (Browser-Local Drafts)

## Why this exists now

CaliVision Studio prioritizes durable authoring before hosted auth/database/storage exists. Local persistence prevents draft loss on refresh/reopen while preserving a drill-first UX and a clean transport boundary.

Android/mobile runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Storage approach

- **IndexedDB** is the source of truth for local drafts.
- Stores:
  - draft records (`packageJson` + metadata),
  - asset blobs (for phase/source images),
  - lightweight metadata (last-opened draft id).
- `localStorage` remains optional for tiny preferences only.

## Local draft lifecycle

Supported local lifecycle actions:

- create new local draft,
- autosave/update draft,
- restore/open draft,
- duplicate draft,
- delete draft.

## Autosave and restore UX

- Studio autosaves edits with a debounce cadence.
- Save state is surfaced as **Saving locally…**, **Saved locally**, or **Save failed**.
- On reopen, Studio restores a requested draft id or the last-opened local draft when available.
- Library lists recent local drafts and offers continue/duplicate/delete actions.

## What survives refresh/reopen

In the same browser/device profile:

- drill draft working state,
- phase/pose/timing/metadata edits,
- local draft lineage/versioning metadata,
- source image assets saved into IndexedDB blob storage (subject to browser quota/storage policy).

## Limitations (intentional)

- local drafts are **not** cloud synced,
- no multi-device sync,
- no real hosted auth/storage/publish,
- clearing browser storage removes local drafts/assets.

## Mental model

- **Local draft** = saved to this browser/device only.
- **Export drill** = portable drill file/package artifact for share/import/runtime usage.
- **Publish** = future hosted/shared flow, not provided by local persistence.

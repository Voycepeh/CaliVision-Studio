# Future User Flows (Planned)

## Upload Video flow (next iterations)

Current baseline is local browser processing. Future work may add:

1. Optional cloud fallback when local processing is slow/unavailable.
2. Optional hosted artifact persistence/history.
3. Optional handoff of upload analysis artifacts into Drill Studio draft generation.
4. Optional Android/mobile runtime interchange workflows.

## Drill Exchange flow (planned)

1. Authenticate and manage account ownership.
2. Publish versioned drill files.
3. Discover and import shared drills.
4. Fork/remix and republish derived versions.
5. Sync flows between Studio and mobile runtime clients.

## Platform dependencies

- hosted auth/identity,
- hosted storage/indexing/search,
- moderation/governance,
- optional cloud-assisted media processing.

Android runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Local-first to hosted-save progression (planned)

Current local draft autosave and Upload Video processing are intentionally browser-scoped. Future hosted save/sync should remain additive and preserve distinction between:

- local browser draft and local video processing,
- drill file export/import,
- hosted account-owned draft sync/publish (future).

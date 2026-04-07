# Future User Flows (Planned)

## Upload Video flow (planned next)

1. Upload media in browser.
2. Process/analyze poses over time.
3. Review generated key phases and quality signals.
4. Convert output into draft drill/reference.
5. Continue refinement in Drill Studio.

## Drill Exchange flow (planned)

1. Authenticate and manage account ownership.
2. Publish versioned drill packages.
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

Current local draft autosave is intentionally browser-scoped and acts as durability groundwork.
Future hosted save/sync will be additive and must preserve clear distinctions:

- local draft persistence (today),
- portable package export/import,
- hosted account-owned draft sync/publish (future).

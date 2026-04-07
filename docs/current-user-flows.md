# Current User Flows (Available Now)

## Home and navigation flow

1. User lands in **Library** (`/library`) as the primary start surface.
2. User chooses a recent drill, creates a new draft via Studio, imports a drill package, or opens Exchange.
3. User moves into **Drill Studio** for editing.

## Current Drill Studio flow

1. Create/open a drill.
2. Edit drill metadata.
3. Create/edit/reorder phases.
4. Upload a phase image.
5. Run detection and apply/refine pose.
6. Preview animation.
7. Export a portable drill package.

## Current availability notes

- Upload Video route exists as first-class product shell, but heavy processing is deferred.
- Drill Exchange discovery is local/mock-backed.
- Hosted auth/storage/community services are deferred.

Android runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Local draft durability flow (available now)

1. User edits in Drill Studio and sees local save state updates (saving/saved/failed).
2. Draft and phase image assets autosave into IndexedDB.
3. On refresh/reopen, user restores the last-opened draft or opens a recent local draft from Library.
4. User exports a portable drill package when they need portability/import to Android runtime client: <https://github.com/Voycepeh/CaliVision>.

Local draft state is browser/device scoped only.

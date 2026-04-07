# Current User Flows (Available Now)

## Home and navigation flow

1. User lands in **Library** (`/library`) as the primary start surface.
2. User clicks **New drill**, continues a local draft, imports a drill file, opens an existing drill, or opens Drill Exchange.
3. User moves into **Drill Studio** for editing, or to **Upload Video** for local analysis workflows.

## Current Drill Studio flow

1. Create a new local draft from Library or open an existing draft/drill.
2. Edit drill metadata (title, slug, required drill type, difficulty, view).
3. Create/edit/reorder phases.
4. Upload a phase image.
5. Run detection and apply/refine pose.
6. Preview animation.
7. Export a drill file when portability is needed.

## Current Upload Video flow

1. Select multiple local videos (file picker or drag/drop).
2. Queue jobs in-browser (default single active processing job).
3. Run MediaPipe Pose Landmarker in video mode locally.
4. Review overlay preview for completed jobs.
5. Download local artifacts (pose timeline JSON, analysis JSON, annotated WebM).

## Current availability notes

- Upload Video processing is browser-local and tab-bound.
- Drill Exchange discovery is local/mock-backed.
- Hosted auth/storage/community services are deferred.

Android runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Local draft durability flow (available now)

1. User edits in Drill Studio and sees local save state updates (saving/saved/failed).
2. Draft and phase image assets autosave into IndexedDB.
3. On refresh/reopen, user restores the last-opened draft or opens a recent local draft from Library.
4. User exports a drill file when they need portability/import to Android runtime client: <https://github.com/Voycepeh/CaliVision>.

Local draft state is browser/device scoped only.

## Library draft/drill lifecycle flow (available now)

1. `New drill` creates a **local draft only** (not a saved drill entry).
2. User is routed directly into Drill Studio with that draft loaded.
3. `Save to library` explicitly promotes the draft into **My drills**.
4. `Delete draft` removes draft-only IndexedDB data for that draft.
5. `Delete` in **My drills** removes the saved drill and cleans linked same-version drafts to avoid orphan records.

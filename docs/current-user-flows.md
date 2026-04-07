# Current User Flows (Available Now)

## Home and navigation flow

1. User lands in **Library** (`/library`) as the primary start surface.
2. User chooses a recent drill, creates a new draft via Studio, imports a drill package, or opens Exchange.
3. User moves into **Drill Studio** for editing, or to **Upload Video** for local analysis workflows.

## Current Drill Studio flow

1. Create/open a drill.
2. Edit drill metadata (title, slug, required drill type, difficulty, view).
3. Create/edit/reorder phases.
4. Upload a phase image.
5. Run detection and apply/refine pose.
6. Preview animation.
7. Export a portable drill package.

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
4. User exports a portable drill package when they need portability/import to Android runtime client: <https://github.com/Voycepeh/CaliVision>.

Local draft state is browser/device scoped only.

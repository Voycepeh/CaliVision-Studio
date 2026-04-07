# Current User Flows (Available Now)

## Home and navigation flow

1. User lands on **Home** (`/`) as the brand-first product entry.
2. User picks one of three primary paths: **Open Library**, **Upload Video**, or **Download Android app**.
3. From **Library** (`/library`), user can create a new drill draft, continue Drafts, open My drills, import drill files, and open Drill Exchange.
4. User moves into **Drill Studio** for editing, or to **Upload Video** for local analysis workflows.

## Current Drill Studio flow

1. Open/create/import a drill from **Library** and enter Studio with one selected drill.
2. Edit drill metadata (title, slug, required drill type, difficulty, view).
3. Create/edit/reorder phases.
4. Upload a phase image.
5. Run detection and apply/refine pose.
6. Preview and validation review.
7. Open advanced diagnostics only when needed (collapsible, hidden by default).

## Current Upload Video flow

1. Select multiple local videos (file picker or drag/drop).
2. Queue jobs in-browser (default single active processing job).
3. Run MediaPipe Pose Landmarker in video mode locally.
4. Persist one local analysis session per completed (or failed) attempt, including source linkage, frame-phase samples, event log, and summary metrics.
5. Review overlay preview for completed jobs.
6. Inspect **Recent analyses** in Upload Video to reopen session summaries, event logs, and JSON debug payload.
7. Download local artifacts in clear user-facing order:
   - Annotated Video,
   - Processing Summary (.json),
   - Pose Timeline (.json),
   - Analysis Session (.json) export-safe payload.

## Current availability notes

- Upload Video processing is browser-local and tab-bound.
- Drill Exchange discovery is local/mock-backed.
- Hosted auth/storage/community services are deferred.

Android runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Draft durability flow (available now)

1. User edits in Drill Studio and sees draft save state updates.
2. Draft and phase image assets autosave into IndexedDB for resilience.
3. On refresh/reopen, user restores the last-opened draft from Library.
4. User exports a portable drill file when they need portability/import to Android runtime client: <https://github.com/Voycepeh/CaliVision>.

Signed-out draft state is browser/device scoped only. Signed-in mode keeps hosted persistence as the primary source of truth.

## Library draft/drill lifecycle flow (available now)

1. `Create new drill` creates a **draft** (work in progress, not yet in My drills).
2. `Continue editing` opens that draft in Drill Studio without automatic promotion.
3. `Save to My drills` explicitly promotes the draft into **My drills**.
4. `Import drill` in Library opens a file picker, validates supported `.json` / `.cvpkg.json`, and saves valid imports into **My drills** with inline success/error feedback.
5. `Export drill file` from **My drills** downloads a portable drill file from Library.
6. `Delete draft` removes draft data from the active persistence scope.
7. `Delete` in **My drills** removes the saved drill from the active persistence scope.

## Hosted drafts foundation (April 2026)

Studio now supports a first real hosted slice with Supabase Auth + Postgres hosted drafts + Storage groundwork while preserving local-first IndexedDB drafts.

- Hosted drafts/My drills are private and user-owned.
- Public Drill Exchange retrieval/publishing remains deferred.
- Package-first authoring remains the core workflow.
- Android runtime responsibilities remain in https://github.com/Voycepeh/CaliVision.
- Signed-in Library keeps one clean account-first Drafts/My drills experience and can offer one-time import of existing local drafts.
- Sign-in local→hosted import is a **move**: each local draft is hosted first, then deleted locally only after hosted save succeeds (failed items remain local and can be retried).

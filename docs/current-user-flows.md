# Current User Flows (Available Now)

## Home and navigation flow

1. User lands on **Home** (`/`) as the brand-first product entry.
2. User picks one of three primary paths: **Open Library**, **Upload Video**, or **Download Android app**.
3. From **Library** (`/library`), user can create a new drill, edit existing drills, view version history, import drill files, and open Drill Exchange.
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
2. Queue jobs in-browser (default single active processing job) with explicit lifecycle labels:
   - ready to analyze,
   - analyzing,
   - analysis completed / failed / cancelled,
   - results available,
   - no structured result available yet.
3. Run MediaPipe Pose Landmarker in video mode locally.
4. Persist one local analysis session per completed, partial, or failed attempt, including source linkage (`sourceId` + URI references for raw/annotated media), frame-phase samples, event log, and summary metrics.
5. Use the upload handoff card to open the latest result from the current upload when available.
6. Review overlay preview for completed jobs.
7. Use **Recent analyses** shortcuts to jump to:
   - latest result from current upload,
   - latest analysis for this drill,
   - any previous session detail.
8. In session detail, inspect:
   - summary + key metrics first,
   - replay/timeline review,
   - event log,
   - collapsible debug/pipeline details,
   - optional raw JSON.
9. Download local artifacts in clear user-facing order:
   - Annotated Video,
   - Processing Summary (.json),
   - Pose Timeline (.json),
   - Analysis Artifact (.json) export payload (versioned structured session export).
10. Export contract details are documented in `docs/analysis-artifact-export.md`.

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

## Library drill/version lifecycle flow (available now)

1. `Create new drill` creates one drill identity with an initial **Draft** version in **My drills**.
2. `Edit` opens or resumes the drill's latest Draft version.
3. If a drill only has a Ready/Published active version, `Edit` creates a new Draft version under the same drill identity.
4. `Mark Ready` promotes a valid Draft version to Ready for upload analysis and publishing eligibility.
5. `Publish` is gated to Ready versions only (Published remains a Ready snapshot with published flag).
6. `Version history` shows per-version status/timestamps within a single drill row without duplicating top-level drill entries.
7. `Import drill file` saves into **My drills** and participates in the same version-aware view.

## Hosted drafts foundation (April 2026)

Studio now supports a first real hosted slice with Supabase Auth + Postgres hosted drafts + Storage groundwork while preserving local-first IndexedDB drafts.

- Hosted drafts/My drills are private and user-owned.
- Public Drill Exchange retrieval/publishing remains deferred.
- Package-first authoring remains the core workflow.
- Android runtime responsibilities remain in https://github.com/Voycepeh/CaliVision.
- Signed-in Library keeps one clean account-first Drafts/My drills experience and can offer one-time import of existing local drafts.
- Sign-in local→hosted import is a **move**: each local draft is hosted first, then deleted locally only after hosted save succeeds (failed items remain local and can be retried).

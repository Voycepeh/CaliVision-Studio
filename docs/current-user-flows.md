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

1. Upload Video opens in **No drill · Freestyle overlay** mode by default.
2. User may optionally select a real drill from local drafts or hosted drills (when signed in) for rep/phase/hold analysis.
3. Upload one local video (file picker or drag/drop) to start processing immediately in-browser.
4. Run MediaPipe Pose analysis locally in-browser for that one active upload.
5. Review the result in the primary analysis area (video + pose overlay + in-video HUD).
6. Use **Overlay Fullscreen** when needed so fullscreen playback keeps video and overlay together.
7. In freestyle mode, drill-specific counters stay hidden; in drill mode, rep/hold/phase diagnostics are shown.
8. Optionally expand advanced diagnostics (temporal trace/events/deep inspection) when drill-mode troubleshooting is needed.
9. Download outputs in this simplified order (shown once in UI):
   - Annotated Video (`.webm`)
   - Processing Summary (`.json`)
   - Pose Timeline (`.json`)
10. Leave or refresh `/upload` to intentionally start fresh.

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

1. `Create new drill` creates one drill identity with one open **working draft** (no released version yet).
2. Version numbers belong to released revisions only (`v1`, `v2`, `v3`).
3. `Edit` opens/resumes the single open draft. If no draft exists and a released version exists, Studio opens a draft for the **next** release (for example, released `v1` => open draft for `v2`).
4. `Mark Ready` finalizes the open draft into the next released version, closes draft state, shows success feedback, and routes back to Library.
5. `Publish` updates publish status on the current released version and does not create duplicate version rows.
6. `Version history` lists released versions only. Open draft state appears separately (for example, “Open draft for v2”).
7. `Import drill file` writes to the active workspace only:
   - signed out → **Browser workspace** (local storage),
   - signed in → **Cloud workspace** (hosted storage).
8. Duplicate imports are explicitly reported (for example, “already exists in Browser workspace / Cloud workspace”) instead of silently no-oping.
9. When signed in, Library does not silently merge browser-local drills into cloud-owned drill rows; local-vs-cloud ownership is clearly separated in messaging.

## Hosted drafts foundation (April 2026)

Studio now supports a first real hosted slice with Supabase Auth + Postgres hosted drafts + Storage groundwork while preserving local-first IndexedDB drafts.

- Hosted drafts/My drills are private and user-owned.
- Public Drill Exchange retrieval/publishing remains deferred.
- Package-first authoring remains the core workflow.
- Android runtime responsibilities remain in https://github.com/Voycepeh/CaliVision.
- Signed-in Library keeps one clean account-first Drafts/My drills experience and can offer one-time import of existing local drafts.
- Sign-in local→hosted import is a **move**: each local draft is hosted first, then deleted locally only after hosted save succeeds (failed items remain local and can be retried).

# Current User Flows (Available Now)

## Home and navigation flow

1. User lands on **Home** (`/`) as the brand-first product entry.
2. User picks one of the primary paths: **Open Library**, **Upload Video**, or **Live Streaming**.
3. From **Library** (`/library`), each drill row is a direct action hub: **Analyze Video**, **Live Coach**, **Edit in Studio**, plus inline **Preview** (no route detour required just to inspect a drill).
4. Analyze Video and Live Coach launch their workflows with the selected drill preloaded via the shared drill context/drill key route handoff.
5. User moves into **Drill Studio** for editing, **Upload Video** for existing file analysis, or **Live Streaming** for active browser camera sessions.

## Current Drill Studio flow

1. Open/create/import a drill from **Library** and enter Studio with one selected drill.
2. Edit drill metadata (title, required drill type, difficulty, primary view). Internal identifiers are system-managed and hidden from normal authoring.
3. Author benchmark metadata inline in Drill Studio (enabled state, source type, label/description, movement type, camera view, optional draft/ready status).
4. Bootstrap benchmark phases from authored drill phases using explicit action controls:
   - initial create when no benchmark phase sequence exists,
   - optional overwrite sync with warning/confirm when benchmark phases already exist.
5. Lightly edit benchmark phase sequence fields (order, key, label, target duration, notes) without launching a separate benchmark-only workflow.
6. Create/edit/reorder authored drill phases and update saved phase fields (phase name, order, duration, authored pose data).
7. Use editor-only controls during pose work (selected joint, focus region, editor view, focus canvas) without changing exported drill data.
8. Upload a phase image.
9. Run detection and apply/refine pose.
10. Preview and validation review.
11. Use **4. Drill version actions** at the bottom of the workflow to save drafts and mark a draft ready for release.
12. Open advanced diagnostics only when needed (collapsible, hidden by default).

## Current Upload Video flow

1. Upload Video opens in **No drill · Freestyle overlay** mode by default.
2. User may optionally select a drill from **My Library** (local browser workspace when signed out, hosted user library when signed in). Selectors group by logical drill and prefer the released version when a draft also exists.
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


## Current Live Streaming flow

1. Open **Live Streaming** (`/live`) from primary navigation.
2. Choose **No drill · Freestyle** or select a drill from **My Library** before session start. The same drill source semantics used by Library are reused in Live.
3. Request camera permission, choose front/rear camera, and confirm preview readiness.
4. Start a live browser session with intentionally capped overlay cadence (**10 FPS**) for mobile stability.
5. If the active camera track exposes real hardware zoom, Studio keeps a compact always-visible **Zoom** control on top of the live preview; unsupported tracks show no zoom control (no software/crop/CSS fallback mode).
6. While running, Studio records raw video and retains timestamped trace data (phase classification, rep/hold events, overlay geometry source data), keeping live overlay alignment bound to the active camera stream geometry.
7. Stop session to finalize recorder + trace; Studio composes annotated replay from retained trace + raw recording so replay/export framing matches the same live camera zoom framing used in-session.
8. Review replay and summary outputs without routing through Upload Video’s offline-file pipeline by default.

Cadence note (April 8, 2026): this browser cadence follows the Android repo’s documented “lightweight in-session overlay” philosophy in `docs/features/live-coaching.md` and `docs/architecture/overlay-rendering.md`, emphasizing responsive coaching feedback over max-FPS rendering.

## Current availability notes

- Upload Video processing is browser-local and tab-bound.
- Drill Exchange is browse/preview first; published drills stay separate from My Library until the user explicitly adds one.
- Hosted auth/storage/community services are deferred.

Android runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Draft durability flow (available now)

1. User edits in Drill Studio and sees draft save state updates.
2. Draft and phase image assets autosave into IndexedDB for resilience.
3. On refresh/reopen, user restores the last-opened draft from Library.
4. User exports a portable drill file when they need portability/import to Android runtime client: <https://github.com/Voycepeh/CaliVision>.

Signed-out draft state is browser/device scoped only. Signed-in mode keeps hosted persistence as the primary source of truth.

## Library drill/version lifecycle flow (available now)

1. `Create new drill` creates one drill identity with one open **working draft** (no released version yet) that starts as a true empty draft (blank title, no auto-seeded phases/pose content).
2. Version numbers belong to released revisions only (`v1`, `v2`, `v3`).
3. `Edit` opens/resumes the single open draft. If no draft exists and a released version exists, Studio opens a draft for the **next** release (for example, released `v1` => open draft for `v2`).
4. `Mark Ready` is blocked until required draft fields are complete (title, movement type, camera view, and at least one authored phase with user-defined content). Incomplete drafts can still be saved/edited.
5. When requirements are satisfied, `Mark Ready` finalizes the open draft into the next released version, closes draft state, shows success feedback, and routes back to Library.
6. `Publish` requires a Ready release, captures lightweight Exchange metadata (title, description, category, difficulty, equipment, tags), and snapshots that specific released version into Drill Exchange.
7. `Version history` lists released versions only. Open draft state appears separately (for example, “Open draft for v2”).
8. `Import drill file` writes to the active workspace only:
   - signed out → **Browser workspace** (local storage),
   - signed in → **Cloud workspace** (hosted storage).
9. Duplicate imports are explicitly reported (for example, “already exists in Browser workspace / Cloud workspace”) instead of silently no-oping.
10. When signed in, Library does not silently merge browser-local drills into cloud-owned drill rows; local-vs-cloud ownership is clearly separated in messaging.

## Hosted drafts + Drill Exchange MVP foundation (April 2026)

Studio now supports a first real hosted slice with Supabase Auth + Postgres hosted drafts + Storage groundwork while preserving local-first IndexedDB drafts.

- Hosted drafts/My drills are private and user-owned.
- Public Drill Exchange now supports publish → browse → detail/preview → explicit **Add to My Library** in Supabase-backed Exchange tables.
- Package-first authoring remains the core workflow.
- Android runtime responsibilities remain in https://github.com/Voycepeh/CaliVision.
- Signed-in Library keeps one clean account-first Drafts/My drills experience and can offer one-time import of existing local drafts.
- Sign-in local→hosted import is a **move**: each local draft is hosted first, then deleted locally only after hosted save succeeds (failed items remain local and can be retried).

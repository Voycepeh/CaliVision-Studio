# Current User Flows (Available Now)

## Home and navigation flow

1. User lands on **Home** (`/`) as the brand-first product entry.
2. User picks one of the primary paths: **Explore Drills**, **Upload Video**, or **Live Streaming**.
3. From **Drills** (`/library`), public **Drill Exchange** discovery appears first and users can launch **Upload Video** or **Live Coaching** directly from public drill cards (no My Drills detour required).
4. **My Drills** is a secondary section on `/library` for authored drafts, imported drill files, private drills, and advanced editing workflows.
5. Moderator/admin tooling is separated into the protected **Admin** route (`/admin`); normal drill cards keep owner-facing actions only (for example **Remove from Public**).
6. Analyze Video and Live Coach launch their workflows with the selected drill preloaded via the shared drill context/drill key route handoff.
7. User moves into **Drill Studio** for editing, **Upload Video** for existing file analysis, or **Live Streaming** for active browser camera sessions.

## Current Drill Studio flow

1. Open/create/import a drill from **Library** and enter Studio with one selected drill.
2. Edit drill metadata (title, required drill type, difficulty, primary view). Internal identifiers are system-managed and hidden from normal authoring.
3. Create/edit/reorder authored drill phases and update saved phase fields (phase name, order, duration, authored pose data).
4. Configure **Phase rules** inline per phase where needed:
   - required phase participation,
   - optional hold requirement,
   - optional minimum/target hold durations.
5. Drill Studio treats authored phase sequence + phase rules as the user-facing reference standard; users do not need to manage a separate benchmark object in normal authoring.
6. Use editor-only controls during pose work (selected joint, focus region, editor view, focus canvas) without changing exported drill data.
7. Upload a phase image.
8. Run detection and apply/refine pose.
9. Preview and validation review.
10. Use **4. Drill version actions** at the bottom of the workflow to save drafts and mark a draft ready for release.
11. Open advanced diagnostics only when needed (collapsible, hidden by default).
12. Legacy benchmark/reference metadata remains compatibility plumbing internally for existing data and deterministic comparison outputs.

## Current Upload Video flow

1. Upload Video opens in **No drill · Freestyle overlay** mode by default.
2. User may optionally select a drill from **My Library** (local browser workspace when signed out, hosted user library when signed in). Upload selectors only include released drill versions; open drafts are not offered as analysis targets.
3. Upload one local video (file picker or drag/drop) to start processing immediately in-browser.
4. Run MediaPipe Pose analysis locally in-browser for that one active upload.
5. Review the result in the primary analysis area (video + pose overlay + in-video HUD).
6. Use **Overlay Fullscreen** when needed so fullscreen playback keeps video and overlay together.
7. In freestyle mode, drill-specific counters stay hidden; in drill mode, rep/hold/phase diagnostics are shown.
8. In drill mode, analysis assumes released drill versions include benchmark metadata from publish. `No benchmark` is treated as a legacy/degraded state only; healthy released drills should compare normally.
9. Upload analysis now includes a compact **Benchmark feedback** layer (rule-based templates only) that surfaces a concise overall summary, up to three prioritized findings, and actionable next-step hints.
10. Replay analysis cards now follow the current playhead timestamp (for example rep count, current hold, current phase, and current rep update when scrubbing backward/forward instead of always showing final session totals).
11. Phase timeline rendering now follows detected analyzed phase progression over time, with a visible playhead position so timeline state and replay state stay aligned.
12. Benchmark phase-sequence wording now stays internally consistent across summary/findings/metric chips (no contradictory “matched” and “mismatch” labels for the same state).
13. Optionally expand advanced diagnostics (temporal trace/events/deep inspection) when drill-mode troubleshooting is needed.
14. Download outputs in this simplified order (shown once in UI):
   - Annotated Video (`.webm`)
   - Processing Summary (`.json`)
   - Pose Timeline (`.json`)
15. Leave or refresh `/upload` to intentionally start fresh.


## Current Live Streaming flow

1. Open **Live Streaming** (`/live`) from primary navigation.
2. Choose **No drill · Freestyle** or select a drill from **My Library** before session start. The same drill source semantics used by Library are reused in Live.
3. Request camera permission, choose front/rear camera, and confirm preview readiness.
4. Start a live browser session with intentionally capped overlay cadence (**10 FPS**) for mobile stability.
5. If the active camera track exposes real hardware zoom, Studio keeps a compact always-visible **Zoom** control on top of the live preview; unsupported tracks show no zoom control (no software/crop/CSS fallback mode).
6. While running, Studio records raw video and retains timestamped trace data (phase classification, rep/hold events, overlay geometry source data), keeping live overlay alignment bound to the active camera stream geometry.
7. Stop session to finalize recorder + trace; Studio composes annotated replay from retained trace + raw recording so replay/export framing matches the same live camera zoom framing used in-session.
8. Review replay and summary outputs without routing through Upload Video’s offline-file pipeline by default.
9. When a drill includes benchmark metadata, live session summaries can include the same deterministic benchmark comparison payload used by upload analysis, plus compact rule-based benchmark feedback once a stable session summary exists (still no AI/LLM explainability).

Cadence note (April 8, 2026): this browser cadence follows the Android repo’s documented “lightweight in-session overlay” philosophy in `docs/features/live-coaching.md` and `docs/architecture/overlay-rendering.md`, emphasizing responsive coaching feedback over max-FPS rendering.

## Current availability notes

- Upload Video processing is browser-local and tab-bound.
- Drill Exchange is now the default drill discovery path on `/library`; published drills still stay separate from My Drills until the user explicitly adds one.
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
6. `Publish` requires a Ready release, then runs a release pipeline (validate publishability → finalize released snapshot → generate benchmark from that snapshot → persist release + benchmark). Publish success is only shown after benchmark persistence succeeds.
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

## Benchmark-driven coaching panel (April 24, 2026)

- Upload and Live analysis now resolve benchmark findings into one shared coaching model instead of isolated UI copy.
- Coaching issues can carry runtime visual guide metadata (`stack_line`, `highlight_region`, `correction_arrow`, `support_indicator`, `metric_badge`) so cue text and overlays stay connected; Drill Studio does not expose those as authored toggles.
- Live mode keeps coaching compact around one primary cue + primary guide, while replay/upload mode can render richer positives, limiter context, and ordered fix steps.
- Benchmark comparison and coaching now feed the same analysis panel so the user sees one consistent “what is good / what is limiting / what to do next” flow.

## Compare workspace (April 25, 2026)

- Upload and Live analysis results now expose **Compare with benchmark** when a drill benchmark and analyzed session are available.
- Compare opens a side-by-side workspace (Benchmark vs Your Attempt) with synchronized replay controls and timeline scrubbing across available visual sources.
- Compare is pose-first for durability in local/session workflows: if replay video is unavailable or fails to load, Compare falls back to skeleton/pose replay from analysis data.
- Metric rows are shown only when computed from real benchmark/attempt data (for example sequence status, timing status, duration deltas, phase timing rows, completed reps/holds, confidence).
- Top takeaway and focus areas are sourced from benchmark/coaching outputs (not hard-coded mockup text).
- Angle-specific form scores and synthetic percentages remain future work unless backed by implemented computed metrics.


## Current History flow (local + hosted)

1. Open **History** (`/history`) from primary navigation.
2. Signed-out users read/write attempt summaries from browser-local storage (copy: “Saved on this browser/device.”).
3. Signed-in users read/write attempt summaries from hosted Supabase storage (copy: “Saved to your account.”).
4. Each entry shows drill, source, timestamp, key metric (reps or hold), status, and top finding/failure reason when available.
5. Studio computes simple per-drill personal best indicators (best reps, longest hold, latest attempt) from saved summaries.
6. If signed in and local history exists, History shows optional **Import local history to account**. Import is duplicate-safe (`client_attempt_id`) and does not silently delete local data.
7. History stays lightweight: no raw videos, annotated video files, or heavy frame-level pose traces are persisted in this surface.

See `docs/attempt-history-storage.md` for storage details and privacy posture.

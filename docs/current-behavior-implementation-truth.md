# Current Behavior — Implementation Truth (Detailed)

Date: April 23, 2026.

This document preserves execution-level behavior detail that is intentionally summarized in `docs/current-user-flows.md`.

Android runtime counterpart (separate ownership): https://github.com/Voycepeh/CaliVision.

## Home and navigation behavior

1. User lands on **Home** (`/`) as the brand-first product entry.
2. User picks one of the primary paths: **Open Library**, **Upload Video**, or **Live Streaming**.
3. From **Library** (`/library`), each drill row is a direct action hub: **Analyze Video**, **Live Coach**, **Edit in Studio**, plus inline **Preview**.
4. Moderator/admin tooling is separated into **Admin** (`/admin`); library drill cards keep owner-facing actions.
5. Analyze Video and Live Coach launch workflows with selected drill context preloaded via drill key handoff.
6. User moves into **Drill Studio**, **Upload Video**, or **Live Streaming** based on intent.

## Drill Studio behavior

1. Open/create/import a drill from Library and enter Studio with one selected drill.
2. Edit metadata (title, movement type, difficulty, primary view).
3. Create/edit/reorder authored phases and per-phase fields.
4. Configure phase rules (required participation, optional hold requirement, optional min/target hold durations).
5. Authored sequence + phase rules remain the user-facing reference standard.
6. Use editor-only controls (selected joint, focus region, editor view, focus canvas) without changing exported drill data.
7. Upload phase image.
8. Run detection and apply/refine pose.
9. Preview and validation review.
10. Use drill version actions to save drafts and mark ready.
11. Open advanced diagnostics only when needed.
12. Legacy benchmark/reference metadata remains compatibility plumbing.

## Upload Video behavior

1. Upload opens in **No drill · Freestyle overlay** mode by default.
2. User may select a drill from **My Library** (browser-local when signed out, hosted when signed in); selectors include released versions only.
3. User uploads one local video to start in-browser processing.
4. MediaPipe Pose analysis runs locally.
5. User reviews video + overlay + HUD outputs.
6. Overlay Fullscreen keeps video + overlay together.
7. Freestyle hides drill counters; drill mode shows rep/hold/phase diagnostics.
8. Drill mode assumes released drill versions include benchmark metadata from publish; `No benchmark` is legacy/degraded.
9. Benchmark feedback is template/rule-based with concise summary + prioritized findings + next-step hints.
10. Replay analysis cards are playhead-relative during scrubbing.
11. Phase timeline tracks analyzed progression and playhead alignment.
12. Benchmark wording stays consistent across summary/findings/chips.
13. Advanced diagnostics remain expandable/optional.
14. Download outputs: Annotated Video (`.webm`), Processing Summary (`.json`), Pose Timeline (`.json`).
15. Refresh/leave `/upload` intentionally starts fresh.

## Live Streaming behavior

1. Open **Live Streaming** (`/live`) from primary navigation.
2. Choose freestyle or a drill from **My Library** before session start.
3. Request camera permission, choose camera, confirm preview readiness.
4. Start live browser session with capped overlay cadence (**10 FPS**) for mobile stability.
5. Hardware zoom appears only when track capabilities support real zoom (no software zoom fallback).
6. While running, Studio records raw video + timestamped trace data.
7. On stop, Studio finalizes recorder + trace and composes annotated replay from retained trace + raw recording.
8. Review replay and summary without routing through Upload pipeline by default.
9. When benchmark metadata exists, live summary can include deterministic benchmark comparison payloads plus template-based feedback.

Cadence note (April 8, 2026): browser cadence follows Android repo’s lightweight in-session overlay philosophy in `docs/features/live-coaching.md` and `docs/architecture/overlay-rendering.md`.

## Availability and persistence truth

- Upload processing remains browser-local and tab-bound.
- Drill Exchange is browse/preview first; published drills are separate until explicit add-to-library.
- Draft durability uses IndexedDB autosave and restore.
- Signed-out state is browser/device scoped; signed-in mode uses hosted persistence as primary.

## Library drill/version lifecycle

1. `Create new drill` creates one drill identity with one open working draft.
2. Version numbers belong to released revisions only (`v1`, `v2`, `v3`).
3. `Edit` opens/resumes single open draft; released-only drills create next-version draft on edit.
4. `Mark Ready` enforces title, movement type, camera view, and authored phase completeness.
5. Successful ready transition finalizes the next released version and routes back to Library.
6. `Publish` requires ready release, validates snapshot, generates benchmark, persists release + benchmark.
7. Version history lists released versions; open draft is shown separately.
8. `Import drill file` writes to active workspace only (signed-out browser workspace, signed-in cloud workspace).
9. Duplicate imports are explicitly reported.
10. Signed-in library avoids silently merging browser-local drills into cloud-owned rows.

## Hosted drafts + Drill Exchange MVP foundation (April 2026)

- Supabase hosted drafts are private and user-owned.
- Public Drill Exchange supports publish → browse → preview/detail → explicit add-to-library.
- Sign-in local→hosted import behavior is a move (delete local only after hosted save success).

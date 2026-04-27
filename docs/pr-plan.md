# PR Plan — Unify My drills with Version-Aware Lifecycle Foundations

## Summary

Refactor drill persistence and library UX from separate Drafts/My drills buckets to a single **My drills** library with a stable drill identity and version-aware lifecycle.

## Problem

The split between top-level Drafts and My drills creates duplicate entries, confusing promotion behavior, and broken edit flows where editing Ready/Published content can create unrelated drill records.

## Scope in this PR

- Single top-level **My drills** view for local library workflows.
- Drill identity + version snapshot repository seam (`drillId` + version records).
- Version status foundation (`draft` | `ready`) plus publish flag (`isPublished`).
- Edit flow foundation:
  - editing Ready/Published creates or resumes a Draft version under the same drill identity.
- Upload Video selection gate:
  - only Ready/Published-capable drills are selectable.
- Publish gate foundation:
  - only Ready versions are publishable.
- Version history foundation:
  - list version number/status/published/timestamp per drill.
- Readiness validator foundation:
  - title, movement type selection, camera view selection, phase presence, and per-phase authored content checks.

## Compatibility / migration posture

- This PR uses a compatibility adapter approach over existing local persistence seams (`draft` + registry storage), minimizing migration risk.
- Existing locally saved data remains accessible through the unified drill/version projection.
- Hosted persistence remains in compatibility mode while unified hosted drill/version tables land.

## Non-goals

- Full visual diff/comparison UI for versions.
- Full backend Exchange publishing redesign.
- Pose/scoring algorithm changes.
- Large Studio layout redesign.

Android runtime/live coaching responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.

## Post-analysis viewer consolidation (Upload Video + Live Streaming)

- Shared `AnalysisViewerShell` module now owns post-analysis result viewing across Upload Video and Live Streaming.
- Page containers keep acquisition/session controls local (file upload + queue controls on Upload Video, camera/session controls on Live Streaming).
- Upload/Live now map page-specific result data through viewer adapters into one normalized contract:
  - `mapUploadAnalysisToViewerModel(...)`
  - `mapLiveAnalysisToViewerModel(...)`
- Timeline interactions (event click to seek), surface switching (Annotated/Raw), summary chips, downloads, and diagnostics rendering are now aligned via the shared viewer model.

## Assumptions / non-goals for phase identity cleanup

- Assumption: `phaseId` is treated as internal stable identity, while `name` is the canonical user-facing phase name in Drill Studio.
- Assumption: legacy placeholders (`phase_top`, `phase_bottom`, `phase_new`) may exist in prior local/imported data and should be normalized on load.
- Non-goal: introducing a new contract field for phase identity in this pass (the existing `phaseId` remains the portable identity field).
- Non-goal: changing Android runtime ownership boundaries; runtime/live coaching remains in Android: <https://github.com/Voycepeh/CaliVision>.

## Assumptions / non-goals for Live camera zoom handling

- Assumption: phone browsers may expose 0.5x either as hardware PTZ zoom on the active rear track **or** as a separate rear ultrawide camera device.
- Assumption: PTZ capability exposure alone is not sufficient to guarantee 0.5x availability; camera-device discovery is required after permission.
- Non-goal: software zoom or crop-based fake zoom fallback for 0.5x in Live Streaming.

## Assumptions / non-goals for Drill Exchange MVP

- Assumption: Exchange is a public/shared drill library view, not a package file dump.
- Assumption: publishing snapshots a specific Ready released version so later private edits do not mutate the public entry.
- Assumption: Exchange entries are preview-only until a user explicitly chooses **Add to My Library**.
- Assumption: Add-to-library creates a user-owned editable drill in standard Library/Studio flow.
- Assumption: fork lineage is best-effort and should degrade gracefully if lineage lookups fail.
- Assumption: owners can remove their own publication from public Drill Exchange via status transitions, while admin/moderator users can hide/archive/delete any publication.
- Assumption: public Drill Exchange discovery and detail reads include only active `Published` entries; imported library drills stay intact after publication moderation changes.
- Non-goal: making Exchange rows directly selectable in Upload Video/Live before user import.
- Non-goal: graph explorer UI/relationship canvas.
- Non-goal: semantic embeddings or chatbot retrieval.
- Non-goal: likes, comments, or ratings.

## Assumptions / non-goals for benchmark-aware coaching foundation

- Assumption: released drill versions are benchmark-backed by default (publish now generates benchmark from the released version snapshot), while legacy releases without benchmark remain explicitly degraded.
- Assumption: benchmark phase sequences remain separate from authored drill phases while providing deterministic mapping hooks.
- Assumption: local drafts, hosted drills, seeded drills, and exchange/public payloads must round-trip benchmark metadata safely when present.
- Current state (April 17, 2026): Studio now includes a first deterministic benchmark comparison engine in analysis result paths (upload + safe live/session integration) with structured outputs for status, phase sequence, and timing tolerance checks.
- Current state (April 17, 2026): comparison signals are intentionally rule-based only (phase order/count, phase timing when available, rep/hold aggregate timing when available), with no AI-generated explanation.
- Current state (April 18, 2026): PR 6 adds a deterministic, template-driven coaching feedback interpretation layer on top of benchmark comparison outputs (summary label, top findings, and actionable next steps) for compact Upload Video + Live presentation.
- Current state (April 18, 2026): benchmark feedback categories now include sequence, timing, duration, consistency, benchmark-missing, and attempt-missing-data with fixed severity buckets (`success`/`warning`/`info`), still without any LLM/AI service calls.
- Current state (April 18, 2026): replay analysis metrics in Upload Video are now playhead-relative during replay (reps/hold/phase/current rep), and benchmark sequence wording/chips were aligned to prevent contradictory matched-vs-mismatch UI states.
- Non-goal: building full side-by-side benchmark comparison UI in this PR.
- Non-goal: AI/LLM coaching explanations in this phase; richer explainability remains deferred.

## Assumptions / non-goals for coach-first drill reference evolution (April 18, 2026)

- Assumption: the authored drill phase order is now the primary deterministic reference standard for comparison and coaching, while `benchmark` metadata remains optional/additive compatibility plumbing.
- Assumption: per-phase optional comparison rules can define hold requirements (`isHoldPhase`, `minHoldDurationMs`, `targetHoldDurationMs`, `durationMatters`) without requiring timing on every phase.
- Assumption: replay analysis cards and timeline should stay playhead-relative (scrub backward reduces current rep/hold/phase state; scrub forward increases).
- Non-goal: replacing the deterministic rule engine with AI/LLM interpretation (still deferred).
- Non-goal: introducing side-by-side authored-vs-reference visual comparison in this pass.
- Non-goal: changing Android runtime/live coaching ownership boundaries; runtime responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.

## Assumptions / non-goals for single-user-first MVP sequencing (April 24, 2026)

- Assumption: near-term roadmap priority is single-user training loop quality (pick drill → run live/upload → understand result → improve next attempt → save progress) before broad marketplace/social expansion.
- Assumption: implementation sequence should follow this order to reduce dependency churn: analysis review clarity, then session history, then fast drill access, then live usability polish, then personal authoring polish.
- Assumption: Drill Exchange remains available during this phase but is not the default center of the training path.
- Non-goal: advanced public discovery sophistication in this phase (large search/filter surfaces, social/community systems, or moderation/admin expansion beyond current baseline).
- Non-goal: multi-user collaboration workflows in this phase.
- Non-goal: moving Android runtime/live coaching ownership into Studio; Android runtime remains in <https://github.com/Voycepeh/CaliVision>.
- Reference roadmap document: `docs/product/single-user-first-roadmap.md`.
- Current state (April 26, 2026): Drill Studio authors optional `coachingProfile` drill metadata focused on drill semantics (movement family, ruleset, support type, primary goal, cue preference) and keeps runtime visual guide toggles out of Studio authoring until implemented in Analysis/Live/Compare.
- Current state (April 26, 2026): Compare route framing is now "Target Check" for MVP analysis flows (did this attempt match the drill target?), while Segment Compare (rep/hold segment-vs-segment) remains planned future work; full-video side-by-side comparison is not the primary MVP path.
- Current state (April 24, 2026): coaching rule resolution now prioritizes authored `coachingProfile` metadata first, while title fallback remains in place only for legacy drills that do not yet have authored coaching metadata.
- Future work: advanced custom cue authoring and per-body-part rule authoring remain explicitly deferred.


## Assumptions / non-goals for attempt history foundation (April 26, 2026)

- Current state (April 26, 2026): Upload Video and Live Streaming persist one lightweight saved-attempt summary per completed run, resolving storage by auth state (signed out = browser-local; signed in = hosted account rows).
- Current state (April 26, 2026): attempt history stores compact summary metrics only (drill/source/time/status/reps/hold/finding), not raw media blobs, annotated videos, or full frame-level traces.
- Current state (April 26, 2026): local history is not auto-migrated; signed-in users can optionally import local summaries to account storage using duplicate-safe client attempt ids.
- Non-goal: social/public sharing, leaderboard behavior, or charts-heavy analytics dashboards in this phase.
- Non-goal: moving Android runtime/live coaching ownership into Studio; runtime remains in Android: <https://github.com/Voycepeh/CaliVision>.

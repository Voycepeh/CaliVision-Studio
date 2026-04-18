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
- Non-goal: making Exchange rows directly selectable in Upload Video/Live before user import.
- Non-goal: graph explorer UI/relationship canvas.
- Non-goal: semantic embeddings or chatbot retrieval.
- Non-goal: likes, comments, ratings, or full moderation systems.

## Assumptions / non-goals for benchmark-aware coaching foundation

- Assumption: benchmark metadata remains attached as optional additive schema (`PortableDrill.benchmark`) for backward compatibility.
- Assumption: drill-authored phases plus optional `PortablePhase.analysis.comparison` rules are now the primary reference criteria for deterministic coaching.
- Assumption: local drafts, hosted drills, seeded drills, and exchange/public payloads must round-trip benchmark metadata safely when present.
- Current state (April 17, 2026): Studio now includes a first deterministic benchmark comparison engine in analysis result paths (upload + safe live/session integration) with structured outputs for status, phase sequence, and timing tolerance checks.
- Current state (April 18, 2026): comparison signals remain deterministic/rule-based (phase sequence, required phase rules, optional hold minimums, optional timing when configured), with no AI-generated explanation.
- Current state (April 18, 2026): PR 6 adds a deterministic, template-driven coaching feedback interpretation layer on top of benchmark comparison outputs (summary label, top findings, and actionable next steps) for compact Upload Video + Live presentation.
- Current state (April 18, 2026): benchmark feedback categories now include sequence, timing, duration, consistency, benchmark-missing, and attempt-missing-data with fixed severity buckets (`success`/`warning`/`info`), still without any LLM/AI service calls.
- Non-goal: building full side-by-side benchmark comparison UI in this PR.
- Non-goal: AI/LLM coaching explanations in this phase; richer explainability remains deferred.
- Non-goal: changing Android runtime/live coaching ownership boundaries; runtime responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.

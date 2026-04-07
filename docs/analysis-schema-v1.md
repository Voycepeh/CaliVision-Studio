# Drill Analysis Schema v1 (Rep/Hold/Hybrid)

## Intent

Drill Studio package payloads now support an additive `analysis` layer so authored drills remain playable **and** can be analyzed later in Upload Video and future live-analysis flows.

Android/mobile runtime client boundary remains explicit: <https://github.com/Voycepeh/CaliVision>.

## Authoring schema vs analysis schema

- **Authoring schema** (`phases`, `poseSequence`, timing/preview metadata) remains the Drill Studio source of truth for draft editing and playback previews.
- **Analysis schema** (`drill.analysis` + `phase.analysis`) captures measurement intent for future comparison engines.
- Analysis fields are additive and optional so older drill files still import.

## Why animation timing is not the source of truth for reps

Rep counting should not require authored animation duration fidelity. Real movement speed varies by athlete/video source, so rep detection is defined as ordered phase progression (`orderedPhaseSequence`) with confirmation and grace controls.

This keeps authored motion preview helpful, but not required for analysis correctness.

## Expected handling of skipped observed phases

Schema v1 supports fast/abbreviated observations with `allowedPhaseSkips` bounded transitions (`fromPhaseId` -> `toPhaseId` with `skippedPhaseIds`) so a temporal engine can tolerate missing intermediate detections without dropping the attempt.

Future classifier/temporal logic should treat skip paths as explicit, bounded alternatives rather than unrestricted phase jumps.

## Why structured logs and annotated video are both required

- **Structured logs** (`AnalysisSession`, `FramePhaseSample`, `AnalysisEvent`) support deterministic metrics, debugging, and downstream data workflows.
- **Annotated video reference** (`annotatedVideoUri`) supports human review, QA, and coaching explainability.

Both are necessary: logs provide machine-readable truth, while annotated media supports visual validation.

## Out of scope in this PR

This schema-only pass intentionally excludes:

- frame scorer implementation,
- temporal smoothing logic,
- event extraction engine runtime,
- persistence wiring/UI,
- replay overlay integration.

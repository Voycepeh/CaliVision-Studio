# PR Plan — Drill Analysis Schema v1

## Summary

Add additive drill-analysis contract metadata so Drill Studio-authored drills can support upcoming Upload Video and future live-analysis flows without changing current playback behavior.

## Problem

Current drill files are playable, but they do not provide enough explicit measurement intent for robust rep/hold interpretation across variable user speed and noisy observations.

## Assumptions

- Studio remains the web-first source of truth for drill authoring.
- Mobile runtime responsibilities stay in Android: <https://github.com/Voycepeh/CaliVision>.
- Local-first browser persistence remains required for resilience.
- Existing drill files without analysis metadata must continue loading unchanged.

## Scope

- Add optional drill-level analysis metadata for rep/hold/hybrid measurement intent.
- Add optional phase-level analysis metadata (`semanticRole`, `isCritical`, `matchHints`).
- Add normalization helpers/defaults for backward compatibility.
- Add typed analysis output models (`AnalysisSession`, `FramePhaseSample`, `AnalysisEvent`).
- Update sample package payloads to include rep/hold/hybrid examples.
- Update package and compatibility docs for schema v1 analysis direction.

## Non-goals

- no frame scorer or pose-comparison runtime implementation,
- no temporal smoothing/event extraction engine behavior,
- no persistence wiring/UI for analysis sessions,
- no replay overlay integration,
- no broad UI rework.

## Follow-up candidates (not included)

- implement per-frame scoring pipeline and confidence calibration,
- implement temporal smoothing + event extraction engine,
- persist analysis sessions and event logs,
- connect structured logs to annotated replay overlays,
- add editor UX for rich analysis metadata authoring.

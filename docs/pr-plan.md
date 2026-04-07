# PR Plan — Drill Comparison Pipeline Skeleton (Phase Scoring + Smoothing + Events)

## Summary

Add a deterministic, testable Drill Studio analysis runtime pipeline that scores sampled pose frames against authored drill phases, smooths temporal phase progression, extracts rep/hold events, and emits typed analysis session outputs for future persistence/replay work.

## Problem

Studio now has drill/package analysis metadata but no runtime comparison layer to interpret sampled motion into actionable, structured analysis outputs.

## Assumptions

- Studio remains the web-first source of truth for drill authoring and portable drill file/package semantics.
- Android runtime/live coaching responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.
- Local-first behavior remains a hard requirement even as hosted foundations grow.
- This PR is intentionally a baseline deterministic pipeline skeleton, not final biomechanics scoring quality.

## Scope

- Add modular analysis runtime stages:
  - frame phase scoring,
  - temporal smoothing/ordered transition enforcement,
  - rep/hold event extraction,
  - session-level analysis runner output.
- Support ordered phase sequence semantics, bounded allowed skip transitions, confirmation frames, and exit grace handling.
- Emit typed event logs and summary metrics from sampled frame analysis.
- Add synthetic fixtures/tests for rep, hold, skip, cooldown, invalid transition, and low-confidence behavior.

## Non-goals

- no production-grade biomechanical model,
- no ML model integration,
- no persistence wiring for analysis sessions,
- no replay overlay rendering/burning into video,
- no broad Upload Video UX overhaul.

## Follow-up candidates (not included)

- persist analysis sessions and query history in Studio,
- connect analysis logs to replay overlay rendering,
- refine scoring model (angles/velocity/domain weighting),
- calibration and confidence tuning with real capture fixtures,
- hybrid drill extraction expansion beyond baseline compatibility.

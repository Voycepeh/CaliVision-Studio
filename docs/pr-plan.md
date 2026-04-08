# PR Plan — Analysis Artifact Export for Persisted Drill Analysis Sessions

## Summary

Add a portable, versioned analysis artifact export for persisted Upload Video analysis sessions so users/developers can download, inspect, share, and reuse structured results outside a single runtime session.

## Problem

Studio already persists analysis sessions and supports in-app review, but there is no explicit export artifact contract for portability, QA/debug handoff, dataset iteration, or future hosted sync/import workflows.

## Assumptions

- Studio remains web-first and local-first for current Upload Video analysis workflows.
- Persisted analysis sessions remain IndexedDB-backed source of truth for export in this phase.
- Android runtime/live coaching responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.
- Export contract evolution should be additive and versioned from day one.

## Scope

- Define a versioned analysis artifact payload contract.
- Add serializer + safe deserializer utilities for artifact JSON.
- Preserve and export pipeline/scoring version metadata.
- Add a minimal download action from Upload Video analysis session detail.
- Provide filename generation utility for deterministic, readable artifact names.
- Add derived-media placeholder metadata for future annotated replay export references.
- Add tests for contract shape, version metadata, filename generation, optional field handling, and parse/round-trip behavior.
- Update docs describing export purpose, scope, and non-goals.

## Non-goals

- full annotated video rendering/export pipeline,
- polished import UX,
- backend artifact sharing,
- cross-device sync,
- large Upload Video UI redesign.

## Follow-up candidates (not included)

- richer Upload Video results browsing and timeline/event inspection UX,
- internal/import UX to rehydrate artifacts into persisted sessions,
- hosted artifact storage/sync with local-first fallback,
- annotated replay/media packaging built on `derivedMedia` hooks.

# PR Plan — Persist Drill Analysis Sessions + Upload History Wiring

## Summary

Persist Drill Studio analysis sessions from Upload Video runs so structured outputs (frame samples, event logs, summary metrics, source linkage) survive beyond one computation and are inspectable in a local history/debug surface.

## Problem

Upload Video can produce analysis artifacts but structured comparison output disappears after a run, making it hard to debug, compare attempts, and prepare for future replay overlays/export workflows.

## Assumptions

- Studio remains the web-first source of truth for drill authoring and portable drill file/package semantics.
- Android runtime/live coaching responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.
- Local-first behavior remains a hard requirement even as hosted foundations grow.
- Local-first persistence remains the default: analysis sessions are durable in browser IndexedDB.
- Android runtime/live coaching responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.

## Scope

- Add a persistence model for analysis sessions (`AnalysisSessionRecord`) that includes:
  - source linkage (`sourceKind`, `sourceId`, `sourceUri`, labels),
  - drill linkage (`drillId`, optional `drillVersion`),
  - status/timestamps,
  - frame phase samples, event log, summary metrics, quality/debug metadata.
- Add repository abstractions for save/get/list-by-drill/list-recent/delete plus JSON serializer/deserializer for round-trip export compatibility.
- Wire Upload Video completion/failure flow to persist one session per attempt.
- Add a minimal Upload Video history/debug inspection surface showing recent sessions, summary metrics, event log, and JSON debug payload.
- Add tests for repository persistence behavior and upload-analysis persistence wiring.

## Non-goals

- no replay overlay rendering onto video preview,
- no auth-first hosted analysis session sync in this PR,
- no major Upload Video visual redesign,
- no scoring model rewrite.

## Follow-up candidates (not included)

- render persisted analysis overlays on replay/preview timeline,
- add drill selection wiring so upload analysis runs against user-selected authored drill drafts,
- add hosted synchronization abstraction for session history while retaining local-first fallback,
- introduce richer comparison views across multiple persisted attempts.

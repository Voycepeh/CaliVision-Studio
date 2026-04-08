# PR Plan — Polish Upload Analysis Flow and Results/Debug UX

## Summary

Improve Upload Video product wiring so the local analysis workflow feels coherent end to end:
`upload -> analyze -> review -> export -> revisit`.

## Problem

Core analysis pieces already exist (schema, pipeline skeleton, persisted sessions, replay, export), but users can still get lost when status is vague, failures are unclear, recent sessions are disconnected, or debug data is hidden/scattered.

## UX/workflow improvements in scope

- Clarify upload entry and analysis lifecycle text with truthful state labels.
- Add tighter handoff from selected upload to latest linked analysis session.
- Improve recent-analysis discoverability with direct shortcuts for current upload + drill context.
- Re-structure session detail for summary-first review, replay focus, event visibility, and tucked debug data.
- Surface partial/missing-data situations explicitly (for example missing source media URI or missing structured samples).
- Keep export actions prominent in session detail.

## Status/error handling expectations

- Do not simulate fake precision or fake progress.
- Distinguish complete, failed, cancelled, and partial analysis outcomes.
- Preserve debug context for failures/partial results.

## Debug affordances

- Collapsible debug section with session/drill IDs, pipeline/scorer versions, detector/cadence metadata, and source URIs.
- Raw JSON remains optional and hidden by default.

## Non-goals

- hosted sync / backend dependence,
- full production analytics dashboarding,
- scoring heuristic rewrites,
- cross-attempt comparison engine,
- top-level navigation redesign.

Android runtime/live coaching responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.

## Follow-up candidates (next PR)

- Improve phase scoring quality and confidence modeling:
  - stronger pose similarity logic,
  - tolerance profiles,
  - visibility/quality gating,
  - phase match confidence calibration,
  - analysis/scorer versioning discipline as scoring evolves.

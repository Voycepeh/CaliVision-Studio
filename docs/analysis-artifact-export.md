# Analysis Artifact Export (Upload Video)

## Purpose

Studio can now export persisted analysis sessions as structured JSON artifacts so results are portable outside one browser runtime session.

This supports:

- debugging and QA,
- dataset iteration,
- user record keeping,
- future hosted sync/import workflows,
- future derived-media packaging.

Studio remains the source of truth for authoring/export workflows, while Android runtime/live coaching remains in the mobile client: <https://github.com/Voycepeh/CaliVision>.

## Artifact contract

Exported artifacts use an explicit, versioned top-level shape:

- `artifactType`: `drill-analysis-session`
- `artifactVersion`: `1.0.0`
- `exportedAt`
- `session`
- `summary`
- `events`
- `frameSamples`
- `source`
- `pipeline`
- `derivedMedia`

Versioning exists from day one so contract evolution can stay additive and forward-compatible.

## What is included now

- Session metadata (id/status/timestamps)
- Drill linkage metadata (`drillId`, title/version when available)
- Summary metrics
- Event log
- Frame-phase samples
- Source linkage metadata (`sourceId`, URIs, labels)
- Analysis pipeline metadata (`pipelineVersion`, `scorerVersion`)
- Derived-media placeholder metadata for annotated replay references

## Export UX

From **Upload Video → Recent analyses → Session detail**, users can download a structured artifact JSON file.

- Filename is deterministic and readable: drill + timestamp + session id.
- Export reads from persisted session data (IndexedDB-backed session source of truth).
- Missing optional fields (for example absent frame samples or source URIs) are handled safely.
- Session detail keeps debug data collapsible (session IDs, drill IDs, pipeline metadata, source linkage) so normal review stays clean while technical inspection remains accessible.
- Failed/partial analyses remain truthfully labeled; export still works for available structured data.

## Structured export vs future annotated replay export

This PR ships only structured analysis JSON export.

Out of scope in this PR:

- full annotated video rendering/export pipeline,
- polished import UX,
- backend sharing,
- cross-device sync.

A lightweight hook exists via `derivedMedia.annotatedReplay` in the artifact manifest so future media export work can attach references without changing the basic artifact shape.

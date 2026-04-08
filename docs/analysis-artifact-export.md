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
- Derived-media metadata for annotated replay references
- Annotated replay export overlays (when analysis is available) that render:
  - phase label at the current replay timestamp,
  - rep count for rep-oriented sessions,
  - active hold timer while a hold is in progress.

## Export UX

From **Upload Video → Recent analyses → Session detail**, users can download a structured artifact JSON file.

- Filename is deterministic and readable: drill + timestamp + session id.
- Export reads from persisted session data (IndexedDB-backed session source of truth).
- Missing optional fields (for example absent frame samples or source URIs) are handled safely.
- Annotated replay export now reuses persisted replay derivation state, so session replay UI and exported video stay time-synced from one source of truth.
- If structured analysis is missing or incomplete, pose overlay export still succeeds and analysis overlays degrade gracefully (for example `Phase: n/a`, hidden hold timer when inactive).
- Session detail keeps debug data collapsible (session IDs, drill IDs, pipeline metadata, source linkage) so normal review stays clean while technical inspection remains accessible.
- Failed/partial analyses remain truthfully labeled; export still works for available structured data.

## Explicit non-goals for this increment

This increment does **not**:

- change scorer/engine accuracy or event-generation logic,
- recompute analysis inside export rendering,
- redesign or replace the current browser-local annotated export pipeline,
- introduce hosted media processing,
- polished import UX,
- backend sharing,
- cross-device sync.

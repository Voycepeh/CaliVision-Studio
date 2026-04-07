# Repo Structure (Cleanup Baseline)

This document describes the post-cleanup structure so Studio contributors can quickly locate foundational systems vs temporary/demo layers.

## Top-level intent

- `src/app/*`: route entrypoints and page-level composition.
- `src/components/*`: UI components only.
- `src/lib/*`: contracts, editor state helpers, package IO, detection mapping, publishing/registry logic.
- `samples/*`: portable package payload fixtures for docs/manual inspection.
- `docs/*`: product and architecture references.

## `src/lib` boundaries

### Foundational contract + package lifecycle

- `src/lib/schema/contracts.ts`: canonical portable contract types.
- `src/lib/package/validation/*`: contract validation and parsing.
- `src/lib/package/import/*`: package and bundle ingest helpers.
- `src/lib/package/export/*`: package and bundle export helpers.
- `src/lib/package/versioning.ts`: version/provenance helpers.
- `src/lib/package/samples/*`: canonical in-repo sample package fixtures.

### Editor/state-facing (Studio-only)

- `src/lib/editor/package-editor.ts`: working-copy mutations, phase ordering, pose/joint updates.
- `src/components/studio/StudioState.tsx`: route-level workspace state orchestration.

### Pose/detection/canvas seams

- `src/lib/detection/*`: detector integration + detector-to-canonical mapping.
- `src/lib/pose/*`: canonical joints and portable pose defaults.
- `src/lib/canvas/*`: coordinate and render-canvas mapping utilities.

### Publishing + registry seams

- `src/lib/publishing/*`: publish artifact construction and readiness checks.
- `src/lib/registry/*`: local catalog/listing identity and storage behavior.

## Notes on placeholders and mocks

- Local-first seeded package data should come from `src/lib/package/samples/*`.
- Registry and marketplace remain local/mock abstractions until backend work is explicitly introduced.
- Keep portable contract examples in `samples/*` aligned with `src/lib/schema/contracts.ts` and `docs/package-spec.md`.

# Architecture

CaliVision Studio is a **package-first web authoring system** where the portable package contract is the source-of-truth boundary between Studio workflows and downstream runtime clients.

Android/mobile runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Architecture principles

1. Portable package contract stability comes first.
2. Studio editor state is distinct from canonical package payloads.
3. Package IO/validation/bundling logic stays outside UI components.
4. Detection vendor outputs are mapped into canonical pose models before broader use.
5. Registry/publishing concerns wrap package artifacts without redefining core package schema.

## Layered architecture

- **Routes (`src/app`)**: page assembly and route semantics (`/studio` primary workspace, `/library` catalog, `/packages` artifact tools, `/marketplace` Drill Exchange direction).
- **Components (`src/components`)**: UI-only rendering and interactions.
- **Editor services (`src/lib/editor`)**: mutable working-copy helpers and phase/joint mutation utilities.
- **Contracts (`src/lib/schema`)**: canonical portable package types.
- **Package lifecycle (`src/lib/package`)**: validation/import/export/versioning/sample fixtures.
- **Detection/Pose (`src/lib/detection`, `src/lib/pose`, `src/lib/canvas`)**: detector integration, mapping to canonical pose, and canvas coordinate utilities.
- **Publishing/Registry (`src/lib/publishing`, `src/lib/registry`)**: local-first publish simulation and package catalog lifecycle.

## Foundational vs temporary code boundaries

- Foundational: schema contracts, package lifecycle helpers, editor working-copy helpers, pose mapping.
- Temporary/local-first: mock publish adapters, local registry storage, placeholder marketplace listing surfaces.

## Workspace state architecture (current)

`StudioState` orchestrates selected package, selected phase, selected joint, and per-phase detection/image overlay state while delegating package mutations to `src/lib/editor/package-editor.ts`.

This keeps key mutation seams explicit:
- source package (imported/seeded baseline),
- working package (editable copy),
- dirty/validation status.

## Repo map

For folder-by-folder responsibility and cleanup boundaries, see [`docs/repo-structure.md`](./repo-structure.md).

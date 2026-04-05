# Architecture (PR1 Foundation)

## Intent

Set up a scalable web foundation for visual drill authoring while preserving compatibility with Android package consumption.

## Current app structure

- `src/app/*` — App Router pages and route composition.
- `src/components/layout/*` — global shell primitives (top bar and 3-panel workspace container).
- `src/components/studio/*` — studio-specific panel content placeholders.
- `src/components/library/*` — library route components.
- `src/components/package/*` — package route components.
- `src/lib/schema/contracts.ts` — canonical portable contract definitions.
- `src/lib/contracts/*` — contract exports for app usage.
- `src/lib/mock/*` — static package/drill mock data.
- `samples/*` — JSON package/drill examples for compatibility reviews.

## Studio shell architecture (`/studio`)

- Left panel: drill/library/assets/packages/recent/marketplace placeholders.
- Center panel: metadata card, phase list, selected phase detail, timeline placeholder, validation notes.
- Right panel: pose canvas/source preview/animation preview/validation/errors/quick actions placeholders.

## Package-first design principles

- Schema version is explicit and required in `DrillManifest`.
- Drill content is represented as portable payloads instead of runtime-specific UI state.
- Joint and coordinate semantics are canonicalized for cross-platform interoperability.
- Future backend/storage integration must preserve package portability.

## Future backend and storage direction (not in PR1)

- package registry service for publishing/discovery,
- object storage for media assets,
- optional auth/team permissions,
- contract-aware validation service.

These are deliberately deferred to keep PR1 focused and incremental.

# Architecture (PR1 Foundation)

## Intent

Establish a clean web foundation for drill authoring without backend coupling.

## Layers

- `src/app/*`: route-level composition using Next.js App Router.
- `src/components/layout/*`: shell primitives (top bar + 3-panel layout).
- `src/components/studio/*`: panel-specific, domain-oriented UI slices.
- `src/lib/schema/*`: portable package contract definitions.
- `samples/*`: static contract examples for compatibility reviews.

## UI shell architecture

The `/studio` route renders:
- Left panel: Library / Assets / Packages
- Center panel: Metadata + phases + timeline placeholder
- Right panel: Inspector + pose canvas placeholder + preview placeholder

This architecture is deliberately static for PR1 and optimized for future extension.

## Non-goals for PR1

- No authentication
- No remote database
- No live pose detection
- No package ingestion pipeline
- No marketplace transactions

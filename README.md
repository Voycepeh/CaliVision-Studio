# CaliVision Studio

CaliVision Studio is a **web-first drill authoring workspace** and future package-sharing platform foundation for CaliVision.

This repository is the long-term home for drill authoring. It is intentionally scoped so Studio and mobile apps can evolve independently while staying aligned through a **portable drill package contract**.

## Why this repo exists separately from mobile

The Android app is currently optimized for runtime coaching and drill consumption. High-throughput authoring needs a desktop-first surface with room for multi-panel editing, validation, and packaging controls.

Keeping Studio separate enables:
- faster authoring UX iteration without destabilizing runtime clients,
- contract-first package evolution with explicit versioning,
- cleaner long-term support for Android and later iOS consumers.

## Product direction

- **Studio (web)** owns drill/package authoring and local package lifecycle controls.
- **Mobile (Android first, later iOS)** owns runtime/live coaching and package consumption.
- Mobile may later support lightweight metadata edits, but full authoring remains in Studio.

## Package-first interoperability

Studio and mobile connect through versioned portable packages.

Current contract baseline:
- `SchemaVersion`
- `DrillPackage`
- `DrillManifest`
- `PortableDrill`
- `PortablePhase`
- `PortablePose`
- `PortableAssetRef`
- `PortableCanvasSpec`
- `PortableViewType`
- `CanonicalJointName`

The contract direction mirrors Android-stabilized semantics:
- normalized 2D coordinate system,
- canonical joint naming,
- explicit phase ordering and timing,
- versioned manifest for safe evolution.

## Current MVP scope (PR3)

Included:
- package IO + validation foundation from PR2,
- canonical Studio pose canvas surface (`src/components/studio/canvas/`),
- centralized canonical joint metadata and skeleton connections (`src/lib/pose/canonical.ts`),
- deterministic normalized coordinate mapping utilities (`src/lib/canvas/`),
- phase selection wiring to right-panel pose visualization and metadata,
- non-destructive warning states for incomplete pose data,
- source asset placeholder cards for future overlay support.

Intentionally deferred:
- full drag/edit manipulation tools,
- MediaPipe detection and detector-specific joint mapping,
- image overlay compositing,
- timeline animation editor,
- auth and backend persistence.

## Local package workflow

From `/studio`:
1. Load a bundled sample package from the left panel.
2. Import a `.json` package from the top bar.
3. Select a phase in the center panel.
4. Inspect the canonical pose canvas and phase metadata in the right panel.
5. Export the selected package back to local JSON.

Validation uses structured issue reporting (`error` vs `warning`) and does not rely on TypeScript types alone.

Current UI limitation in PR3: Studio renders the first drill in each package as the active workspace drill; multi-drill browsing/editing is deferred.

## Tech stack

- Next.js (App Router)
- React
- TypeScript
- ESLint (Next + TypeScript rules)
- Local static/mock data for foundation phases

## Getting started

```bash
npm install
npm run dev
```

Open: <http://localhost:3000>

## Route map

- `/` - project entry and route index
- `/studio` - package-driven workspace with canonical pose canvas preview
- `/library` - source/library placeholder
- `/packages` - package workflow placeholder
- `/marketplace` - future sharing surface placeholder

## Additional docs

- `docs/product-direction.md`
- `docs/architecture.md`
- `docs/package-spec.md`
- `docs/android-compatibility.md`
- `docs/roadmap.md`
- `docs/pr-plan.md`

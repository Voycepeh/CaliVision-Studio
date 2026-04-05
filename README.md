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

## Current MVP scope (PR2)

Included:
- package IO foundation under `src/lib/package/*`,
- bundled sample package loading,
- local JSON import and validation in Studio,
- local JSON export for currently loaded package,
- left/center/right Studio panels wired to real package data and validation output,
- docs updates for local import/export workflow.

Intentionally deferred:
- pose editing,
- MediaPipe integration,
- auth,
- remote database/storage,
- package publishing/marketplace backend.

## Local package workflow

From `/studio`:
1. Load a bundled sample package from the left panel.
2. Import a `.json` package from the top bar.
3. Review validation issues in workspace/inspector panels.
4. Export the selected package back to local JSON.

Validation uses structured issue reporting (`error` vs `warning`) and does not rely on TypeScript types alone.

Current UI limitation in PR2: Studio surfaces the first drill in a package for workspace/inspector rendering; multi-drill browsing/editing is deferred.

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
- `/studio` - package-driven workspace with local import/export
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

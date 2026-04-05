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

- **Studio (web)** owns full drill authoring, package assembly, and future publishing.
- **Mobile (Android first, later iOS)** owns runtime/live coaching and drill consumption.
- Mobile may later support lightweight metadata edits, but full authoring remains in Studio.

## Package-first interoperability

Studio and mobile connect through versioned portable packages.

This PR establishes foundational contract types for:
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

## Current MVP scope (PR1)

Included:
- Next.js + TypeScript App Router foundation,
- desktop-first dark Studio shell,
- placeholder routes (`/`, `/studio`, `/library`, `/packages`, `/marketplace`),
- package contract groundwork,
- static mock/sample package payloads,
- architecture + roadmap documentation.

Intentionally not included:
- auth,
- remote database/storage,
- MediaPipe integration,
- live coaching in web,
- full marketplace behavior.

## Human-in-the-loop workflow

Studio is designed for guided authoring where humans stay in control:
1. define metadata and package intent,
2. author and order phases,
3. review pose/canvas alignment,
4. resolve validation warnings,
5. export or publish package revisions.

Automation (schema checks, pose assist, future detection) supports this process rather than replacing it.

## Tech stack

- Next.js (App Router)
- React
- TypeScript
- ESLint (Next + TypeScript rules)
- Local static/mock data for foundation PR

## Getting started

```bash
npm install
npm run dev
```

Open: <http://localhost:3000>

## Route map

- `/` - project entry and route index
- `/studio` - flagship workspace shell
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

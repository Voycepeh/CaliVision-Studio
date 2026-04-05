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

## Current MVP scope (PR5)

Included:
- package IO + validation foundation,
- in-memory package working copy + dirty tracking,
- phase list/detail editing + canonical joint editing,
- image-first MediaPipe pose detection workflow per selected phase,
- detector-to-canonical mapping into portable pose joints,
- explicit detection review/apply flow (detect -> preview -> apply),
- detection failure/partial warnings without silent pose overwrites,
- local source image association placeholder in phase `assetRefs` for working package review,
- export of updated canonical pose package JSON.

Intentionally deferred:
- browser live coaching,
- video detection pipeline,
- cloud/background processing,
- backend/cloud persistence,
- full source image overlay alignment editor,
- animation timeline editor.

## Local detection workflow

From `/studio`:
1. Load a bundled sample package or import a local package JSON.
2. Select a phase in the center workspace panel.
3. In inspector, upload a local image for that phase.
4. Click **Detect pose** to run MediaPipe in-browser.
5. Review mapped canonical preview + warnings/coverage.
6. Click **Apply to phase** to intentionally replace phase pose.
7. Refine joints manually with existing canvas and numeric controls.
8. Export updated package JSON.

## Source image behavior in PR5

- Source images stay local in browser memory only.
- Studio writes a placeholder phase asset reference (`local://phase-images/...`) into working package state.
- No binary image embedding and no remote asset storage is implemented in this PR.

## Getting started

```bash
npm install
npm run dev
```

Open: <http://localhost:3000>

## Route map

- `/` - project entry and route index
- `/studio` - package-driven workspace with canonical pose canvas + detection workflow
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

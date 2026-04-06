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

## Current MVP scope (PR8)

Included:
- package IO + validation foundation,
- in-memory package working copy + dirty tracking,
- phase list/detail editing + canonical joint editing,
- image-first MediaPipe pose detection workflow per selected phase,
- detector-to-canonical mapping into portable pose joints,
- explicit detection review/apply flow (detect -> preview -> apply),
- detection failure/partial warnings without silent pose overwrites,
- source-image + canonical-pose overlay authoring surface on fixed portrait canvas,
- editor-only image alignment controls (show/hide, opacity, fit, reset, offset) separated from canonical pose coordinates,
- phase-specific source image metadata/status in the Studio working state and inspectors,
- local source image association placeholder in phase `assetRefs` for working-package review only,
- bundled export/import for local-first package assets (phase images + thumbnails metadata).
- export of updated canonical pose package + bundled asset payload.
- right-panel animation preview panel with deterministic phase-sequence playback,
- linear interpolation between consecutive canonical phase poses for flow validation,
- playback controls (play, pause, restart, loop toggle, speed multiplier),
- preview warnings for invalid durations / sparse pose coverage / low phase count,
- live preview updates from unsaved edits to phase order, joints, and durations,

Intentionally deferred:
- browser live coaching,
- video detection pipeline,
- cloud/background processing,
- backend/cloud persistence,
- remote source image asset storage/publishing architecture,
- full timeline/motion-curve editor.

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
## Local drill file workflow

From `/studio`:
1. Load a bundled sample drill from the left panel.
2. Import a `.json` drill file or `.cvpkg.json` bundled drill package from the top bar.
3. Select/edit phases in the center panel.
4. Edit joint coordinates in the right inspector (canvas drag or numeric controls).
5. Export the edited working copy as a bundled drill package (`.cvpkg.json`) with package assets.

## Source image behavior in PR6

- Source images stay local in browser memory only.
- Studio keeps image overlay display/alignment state in editor working state only (fit mode, opacity, offsets, layer visibility).
- Studio may stage temporary placeholder phase asset references (`local://phase-images/...`) while editing for provenance.
- Export strips all temporary local phase-image refs and does not export editor-only overlay transforms, keeping JSON portable for Android/mobile consumers.
- No binary image embedding and no remote asset storage is implemented in this PR.

## MediaPipe runtime note

- Current PR5 runtime uses legacy browser MediaPipe Pose (`@mediapipe/pose/pose.js`) in IMAGE mode.
- Detector metadata reflects this runtime as `mediapipe-pose` + `pose-js`.

## Animation preview behavior in PR7

- Preview reads only from current editor working state and uses the same canonical `phase.poseSequence[0]` + `durationMs` values that export to package JSON.
- Timing assumption for PR7: each phase `durationMs` is treated as the transition segment length to the next ordered phase.
- Interpolation uses simple linear x/y blending for shared joints; joints missing in one pose fall back to the available endpoint value.
- Single-phase drills are supported (static hold for that phase duration).
- Invalid durations (`<= 0` or non-finite) are replaced with a safe fallback during preview only, and surfaced as warnings.
- This panel is validation-first and intentionally does not introduce motion authoring curves, backend persistence, or runtime live-coaching features.

## Getting started

```bash
npm install
npm run dev
```

Open: <http://localhost:3000>

## Route map

- `/` - project entry and route index
- `/studio` - drill-file-driven workspace with canonical pose canvas preview
- `/library` - source/library placeholder
- `/packages` - drill file workflow placeholder
- `/marketplace` - future sharing surface placeholder

## Additional docs

- `docs/product-direction.md`
- `docs/architecture.md`
- `docs/package-spec.md`
- `docs/android-compatibility.md`
- `docs/roadmap.md`
- `docs/pr-plan.md`

## Local bundled asset strategy (PR8)

- Source images and drill thumbnails are represented as portable asset refs with deterministic `package://assets/...` URIs.
- Studio export writes a logical bundle payload containing bundle metadata, drill JSON, and embedded asset binaries.
- Studio import hydrates bundled phase images back into overlay authoring state when present.
- JSON-only package import remains supported for backward compatibility.
- Cloud storage, publishing, and marketplace flows are intentionally deferred.

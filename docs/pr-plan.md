# PR Plan (Foundation and Sequencing)

## PR1 (completed)

- Bootstrap the web repository with Next.js + TypeScript + App Router.
- Establish desktop-first dark Studio shell.
- Add foundational product and architecture docs.
- Define portable package contracts aligned with Android compatibility.
- Add lightweight runtime validation seam for unknown package JSON payloads.

## PR2 (completed)

- Add package IO foundation (`src/lib/package/*`).
- Add local import and export controls in Studio top bar.
- Add structured package validation (`error` vs `warning`, field paths).
- Add bundled sample package loading (valid + intentionally invalid fixture).
- Wire left/center/right Studio panels to loaded package content.
- Surface package validation status and issues directly in UI.
- Keep workflow local-only (no backend/auth/object storage).

## PR3 (completed)

- Add canonical pose canvas component (`src/components/studio/canvas/PoseCanvas.tsx`).
- Add canonical joint metadata + skeleton connection definitions (`src/lib/pose/canonical.ts`).
- Add normalized coordinate mapping utilities (`src/lib/canvas/*`).
- Add package-to-canvas mapping view models for selected phase rendering.
- Wire phase selection to right-panel visual pose canvas + inspector summary.
- Surface empty/incomplete pose states and non-destructive warnings.
- Add source asset placeholder metadata summary under the inspector canvas.

## PR4 (completed)

- Add Studio editor working-copy state with non-destructive local mutations and dirty tracking.
- Add phase list editing (rename/add/delete/duplicate/reorder).
- Add phase detail editing (duration, summary, view metadata).
- Add lightweight joint editing on canonical pose canvas (select + drag + numeric/nudge).
- Add export integration for working-copy JSON.
- Extend validation surfacing for sequencing/title quality warnings.

## PR5 (this change)

- Add image-first MediaPipe pose detection workflow for selected phase images.
- Implement detection runtime via browser MediaPipe Pose (`@mediapipe/pose/pose.js`) with isolated adapter.
- Isolate detector runtime under `src/lib/detection/mediapipe/`.
- Add explicit detector result model (`DetectionResult`, confidence, metadata, issues).
- Add centralized detector-to-canonical mapping into portable pose joints.
- Add detection review UX (upload image, detect, preview mapped pose, explicit apply).
- Preserve manual joint editing flow after apply.
- Preserve current phase pose on failures unless user applies a successful/partial result.
- Store phase source image refs as local placeholder `assetRefs` in working package state.
- Strip temporary `local://phase-images/...` refs on export to preserve portable package compatibility.

## Assumptions

- Android remains the temporary semantics reference for portable packages.
- Studio stays package-first and contract-aligned.
- Canonical pose canvas remains the fixed visual reference for edit/detection interactions.
- Source image binaries remain local-only and are not embedded in exported package payloads.

## Non-goals (still deferred)

- No auth/identity.
- No cloud persistence or object storage.
- No video detection pipeline.
- No browser live coaching.
- No source image overlay alignment editor.
- No timeline animation editor.
- No dedicated multi-drill package navigation UI yet (first drill shown in workspace).

## UI terminology + preview parity follow-up (current)

- Shift user-facing Studio wording from package-first labels to drill-first and drill-file-first copy.
- Keep manifest/package naming untouched in contract and schema internals for compatibility.
- Align canonical preview styling with Android live-coaching overlay (mint skeleton, emphasized nose/hips, cyan guide lines).
- Align visible preview joint/connection sets with Android live-coaching semantics.

### Assumptions

- `PortableViewType` remains unchanged (`front | side | rear | three-quarter`).
- Preview rendering maps `front/rear/three-quarter` to bilateral display and `side` to a single profile chain.
- In `side` view, Studio currently defaults to **left-side chain rendering** for preview only until side metadata exists.

### Non-goals

- No contract/schema field rename for package/manifest identifiers.
- No import/export compatibility changes for portable drill package JSON.

## Recommended next PR sequence

1. **PR6:** source image overlay support and pose/image alignment workflow.
2. **PR7:** animation preview based on edited phase sequence and durations.
3. **PR8:** local package asset bundling strategy for source images and thumbnails.

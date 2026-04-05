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

## Assumptions

- Android remains the temporary semantics reference for portable packages.
- Studio stays package-first and contract-aligned.
- Canonical pose canvas is the fixed visual reference surface for upcoming edit and detection flows.
- Static/local data is sufficient for PR3 visualization workflows.

## PR4 (this change)

- Add Studio editor working-copy state with non-destructive local mutations and dirty tracking.
- Add phase list editing (rename/add/delete/duplicate/reorder).
- Add phase detail editing (duration, summary, view metadata).
- Add lightweight joint editing on canonical pose canvas (select + drag + numeric/nudge).
- Add export integration for working-copy JSON.
- Extend validation surfacing for sequencing/title quality warnings.

## Assumptions

- Android remains the temporary semantics reference for portable packages.
- Studio stays package-first and contract-aligned.
- Canonical pose canvas remains the fixed visual reference for edit interactions.
- Static/local data is sufficient for PR4 local authoring workflows.

## Non-goals (still deferred)

- No auth/identity.
- No cloud persistence or object storage.
- No MediaPipe integration.
- No source image overlay compositing.
- No timeline animation editor.
- No dedicated multi-drill package navigation UI yet (first drill shown in workspace).

## Recommended next PR sequence

1. **PR5:** MediaPipe image pose detection + detector-to-canonical joint mapping.
2. **PR6:** source image overlay support and pose/image alignment workflow.
3. **PR7:** animation preview based on edited phase sequence and durations.

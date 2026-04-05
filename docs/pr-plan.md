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

1. **PR5:** MediaPipe image pose detection + detector-to-canonical joint mapping.
2. **PR6:** source image overlay support and pose/image alignment workflow.
3. **PR7:** animation preview based on edited phase sequence and durations.

## PR5 (this change)

- Replace fixed three-column shell with a resizable panel layout for desktop authoring.
- Add compact/tabs fallback for narrower widths instead of squeezing the center workspace.
- Move the canonical pose editor and joint controls into the center inspector workspace.
- Add focus-region filtering controls for joint inspection without mutating canonical data.
- Convert drill/package metadata cards into controlled editable inputs wired to working copy state.
- Separate movement metadata from package/export metadata in the right-side details flow.
- Relocate validation summary and source asset information into right-side details.

## Assumptions

- Canonical pose editor canvas dimensions and pose normalization semantics remain unchanged.
- Focus region controls are viewport/control-only filters and never persist coordinate transforms.
- Metadata edits should immediately affect dirty state and export payload from the working copy.

## Non-goals

- No schema contract changes and no Android compatibility contract changes.
- No backend persistence or collaboration features.
- No zoom/pan persistence or authored coordinate remapping.

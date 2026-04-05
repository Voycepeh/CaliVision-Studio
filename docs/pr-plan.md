# PR Plan (Foundation and Sequencing)

## PR1 (completed)

- Bootstrap the web repository with Next.js + TypeScript + App Router.
- Establish desktop-first dark Studio shell.
- Add foundational product and architecture docs.
- Define portable package contracts aligned with Android compatibility.
- Add lightweight runtime validation seam for unknown package JSON payloads.

## PR2 (this change)

- Add package IO foundation (`src/lib/package/*`).
- Add local import and export controls in Studio top bar.
- Add structured package validation (`error` vs `warning`, field paths).
- Add bundled sample package loading (valid + intentionally invalid fixture).
- Wire left/center/right Studio panels to loaded package content.
- Surface package validation status and issues directly in UI.
- Keep workflow local-only (no backend/auth/object storage).

## Assumptions

- Android remains the temporary semantics reference for portable packages.
- Studio stays package-first and contract-aligned.
- Static/local data is sufficient for PR2 package workflows.

## Non-goals (still deferred)

- No auth/identity.
- No cloud persistence or object storage.
- No MediaPipe integration.
- No pose editing canvas interactions yet.
- No package publishing backend/marketplace flows.

## Recommended next PR sequence

1. **PR3:** pose canvas foundation with canonical joints and normalized coordinates.
2. **PR4:** phase editing + timing editing.
3. **PR5:** MediaPipe image pose detection + detector-to-canonical mapping.

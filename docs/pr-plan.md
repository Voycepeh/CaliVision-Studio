# PR Plan (Foundation and Sequencing)

## PR1 scope (this change)

- Bootstrap the web repository with Next.js + TypeScript + App Router.
- Establish a credible desktop-first dark Studio shell.
- Add foundational product and architecture docs.
- Define portable package contracts aligned with Android compatibility.
- Add lightweight runtime validation seam for unknown package JSON payloads.
- Add mock and sample payloads for future import/export work.

## Assumptions

- Android remains the temporary semantics reference for portable packages.
- No backend/auth/storage is needed for this foundation PR.
- Local mock data is sufficient to validate information architecture.

## Non-goals

- No auth/identity.
- No cloud persistence or object storage.
- No MediaPipe integration.
- No live web coaching.
- No full marketplace behavior.

## Recommended next PR sequence

1. **PR2:** package import/export + JSON validation + sample package loader.
2. **PR3:** pose canvas foundation with canonical joints and normalized coordinates.
3. **PR4:** phase editor + timing editor + animation preview.
4. **PR5:** MediaPipe image pose detection + detector-to-canonical mapping.

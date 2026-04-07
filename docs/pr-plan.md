# PR Plan — UX/Product-Flow Pass

## Summary

This pass prioritizes product IA and UX clarity on top of the existing local-first package foundation.

## Assumptions

- Studio is the web-first source of truth.
- Mobile runtime responsibilities remain in Android: <https://github.com/Voycepeh/CaliVision>.
- No real auth/backend/storage is added in this pass.

## Non-goals

- no giant architecture rewrite,
- no heavy video processing implementation,
- no browser live coaching,
- no social/community feature buildout,
- no contract-breaking package changes.

## Scope

- Library as default home UX.
- Studio workflow wording/state clarity polish.
- Upload Video first-class route shell.
- Marketplace reframed as Drill Exchange in user-facing UX.
- Terminology cleanup (drill-first wording; package where technical).
- docs synchronized to current-vs-future product story.

## Local persistence pass additions

### Scope additions

- Add browser-local IndexedDB draft repository and local asset blob storage.
- Add Studio autosave and restore-last-opened behavior.
- Surface local drafts in Library with continue/duplicate/delete actions.
- Add local-vs-export-vs-future-hosted clarity in UX and docs.
- Keep Drill Studio workflow-first editing with collapsible sections and no redundant top step bar.
- Keep package/container identifiers out of default authoring flow except where needed for import/export/publish internals.
- Keep system-managed internal IDs immutable in UI.
- Require explicit drill type selection (`hold` or `rep`) in main Drill info workflow.

### Additional non-goals

- no hosted auth/storage/sync,
- no cross-device collaboration,
- no Supabase/backend integration in this pass.

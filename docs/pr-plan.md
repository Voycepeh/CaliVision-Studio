# PR Plan — Drill-First IA Refresh on Main

## Summary

This pass reapplies the drill-first IA cleanup directly on top of current `main`, replacing package-first user wording and flow in navigation, Library, Studio shell copy, and docs.

## Assumptions

- Studio remains the web-first source of truth for drill authoring.
- Mobile runtime responsibilities stay in Android: <https://github.com/Voycepeh/CaliVision>.
- Local-first browser persistence (IndexedDB + localStorage metadata) remains the active storage model.

## Non-goals

- no hosted backend sync/auth/storage,
- no package contract/schema changes,
- no Android runtime behavior changes,
- no Drill Exchange backend implementation,
- no broad refactor of internal package-based type names.

## Scope

- Remove package as a top-level UX concept in nav and primary flows.
- Keep `/packages` as compatibility handling only (redirect to `/library`).
- Make Library the obvious home for create/continue/open/import/browse.
- Ensure `New drill` creates local draft only and routes straight into Studio by draft id.
- Update Studio top-bar identity and action labels to drill/draft language.
- Keep technical package/file metadata only as secondary diagnostics.
- Synchronize docs and AGENTS guidance with drill-first UX story.

## Follow-up candidates (not included)

- add guided first-run onboarding in Library,
- add richer Exchange-to-Library fork shortcuts,
- refine secondary advanced file/metadata panel grouping.

# PR Plan — Brand-First Home + Library IA Shift

## Summary

This pass introduces a dedicated `/` homepage for CaliVision Studio and moves Library into its intended role as a workflow workspace at `/library`.

## Assumptions

- Studio remains the web-first source of truth for drill authoring.
- Mobile runtime responsibilities stay in Android: <https://github.com/Voycepeh/CaliVision>.
- Local-first browser persistence (IndexedDB + localStorage) remains the active storage model.

## Non-goals

- no hosted backend sync/auth/storage,
- no package contract/schema changes,
- no Android runtime behavior changes,
- no Drill Exchange backend implementation,
- no final app store/download URL integration yet.

## Scope

- Replace root-route redirect with a polished Home landing page.
- Keep Library intact as drafts/saved-drills management and Studio entry surface.
- Update top-level navigation to foreground Home, Library, Upload Video, Exchange, and app download CTA.
- Add icon-led homepage sections for hero, 3 core flow cards, workflow overview, and Android download placeholder.
- Keep copy product-facing (drill/library/upload/app), while preserving package terminology in deeper technical surfaces.

## Follow-up candidates (not included)

- wire final Android store URL and update CTA target,
- add polished rendered visuals/screens when available,
- add personalized/usage-aware homepage content,
- introduce optional Exchange spotlight modules once backed by hosted data.

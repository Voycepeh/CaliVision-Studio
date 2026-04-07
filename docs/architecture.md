# Architecture

CaliVision Studio is drill-first in user experience while maintaining package/file contracts as internal portability boundaries.

Android/mobile runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Route-level IA

- `/`: brand-first product landing page.
- `/library`: primary drill workspace and management hub.
- `/studio`: core draft editing workspace.
- `/upload`: Upload Video workflow shell.
- `/marketplace`: Drill Exchange discovery surface (local/mock for now).
- `/packages`: compatibility route that redirects to Library.

## Architectural guardrails

1. Preserve portable package contract stability.
2. Keep user-facing drill/draft language while retaining package correctness internally.
3. Keep backend/auth/storage concerns local/mock unless explicitly implemented.
4. Maintain clean seams (`src/lib/*`) for editor/package/registry/detection services.

## Local draft persistence architecture

- Local draft repository lives under `src/lib/persistence/*` and isolates browser APIs from UI.
- IndexedDB stores draft records, draft asset blobs, and lightweight metadata (for example last-opened draft id).
- Studio state orchestrates autosave/restore while keeping portable package contracts unchanged.
- Library surfaces local drafts as first-class entries with clear local-only messaging.
- Android/mobile runtime responsibilities remain downstream in <https://github.com/Voycepeh/CaliVision>.

## Hosted drafts foundation (April 2026)

Studio now supports a first real hosted slice with Supabase Auth + Postgres hosted drafts + Storage groundwork while preserving local-first IndexedDB drafts.

- Hosted drafts are private and user-owned.
- Public Drill Exchange retrieval/publishing remains deferred.
- Package-first authoring remains the core workflow.
- Android runtime responsibilities remain in https://github.com/Voycepeh/CaliVision.


## Drill analysis schema layering

- Drill authoring/playback fields remain the source of truth for Studio editing and preview.
- Additive `analysis` metadata on drills/phases defines rep/hold/hybrid interpretation intent for Upload Video and future live-analysis flows.
- Rep detection intent is phase-order based (not authored animation duration based), with explicit skip-path support for fast observations.
- See `docs/analysis-schema-v1.md` for detailed schema boundaries and deferred engine work.

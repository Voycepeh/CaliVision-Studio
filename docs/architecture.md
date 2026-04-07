# Architecture

CaliVision Studio remains package-first under the hood, while UX is now organized by product flow.

Android/mobile runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Route-level IA

- `/library`: user home and drill hub.
- `/studio`: core editing workspace.
- `/upload`: Upload Video workflow shell.
- `/marketplace`: Drill Exchange discovery surface (local/mock for now).
- `/packages`: technical portability/import-export tools.

## Architectural guardrails

1. Preserve portable package contract stability.
2. Keep user-facing drill language while retaining package correctness internally.
3. Keep backend/auth/storage concerns local/mock unless explicitly implemented.
4. Maintain clean seams (`src/lib/*`) for editor/package/registry/detection services.

## Local draft persistence architecture

- Local draft repository lives under `src/lib/persistence/*` and isolates browser APIs from UI.
- IndexedDB stores draft records, draft asset blobs, and lightweight metadata (for example last-opened draft id).
- Studio state orchestrates autosave/restore while keeping portable package contracts unchanged.
- Library surfaces local drafts as first-class entries with clear local-only messaging.
- Android/mobile runtime responsibilities remain downstream in <https://github.com/Voycepeh/CaliVision>.

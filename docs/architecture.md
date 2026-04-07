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

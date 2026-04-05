# Agent Guidance for CaliVision Studio

## Core philosophy

1. Treat the **web Studio** as the authoring source of truth.
2. Preserve **portable package compatibility** for Android/mobile consumers.
3. Avoid duplicating heavy authoring logic into mobile clients.

## Required engineering behavior

- If you modify drill/package contracts, update:
  - `src/lib/schema/contracts.ts`
  - `docs/package-spec.md`
  - `docs/android-compatibility.md`
- Keep PRs incremental and backwards-compatible whenever possible.
- Prefer explicit schema versioning and manifest evolution notes.
- Use static/mock data unless a PR explicitly introduces backend integration.

## Workflow discipline

- Keep UI, schema, and documentation changes aligned in the same PR.
- Document assumptions and non-goals in `docs/pr-plan.md`.
- Add or update sample package payloads under `samples/` when contracts change.

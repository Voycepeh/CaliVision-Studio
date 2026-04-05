# Agent Guidance for CaliVision Studio

## Core philosophy

1. Treat the **web Studio** as the primary authoring source of truth.
2. Preserve **portable package compatibility** for Android/mobile consumers.
3. Keep Studio visual-first and package-first.
4. Avoid duplicating heavy runtime/live-coaching concerns into Studio.

## Required engineering behavior

- Preserve Android compatibility when modifying contracts, semantics, or package examples.
- Treat the portable drill package contract as sacred.
- Do not invent incompatible joint names, coordinate systems, or phase semantics.
- Keep PRs incremental and backwards-compatible whenever possible.
- Prefer explicit schema versioning and manifest evolution notes.
- Use static/mock data unless a PR explicitly introduces backend integration.
- Prefer additive changes over speculative rewrites.

## Contract/doc synchronization (mandatory)

If you modify drill/package contracts, update all of:
- `src/lib/schema/contracts.ts`
- `docs/package-spec.md`
- `docs/android-compatibility.md`
- `samples/` payloads impacted by the change

## Workflow discipline

- Keep UI, schema, and documentation changes aligned in the same PR.
- Document assumptions and non-goals in `docs/pr-plan.md`.
- Update docs whenever contract/workflow expectations change.

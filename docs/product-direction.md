# Product Direction

## Ownership boundaries

### Studio (web) responsibilities

Studio is the source of truth for:
- package authoring,
- phase sequencing/timing and pose editing,
- package validation,
- package import/export,
- local/mock publish preparation.

### Mobile responsibilities (Android first, later iOS)

Mobile clients remain runtime/live-coaching consumers of portable package payloads.

## PR10 direction: local-first ecosystem semantics

PR10 introduces product semantics that make the ecosystem understandable before backend rollout:

- **Library** = what is locally available to this Studio context.
- **Packages** = portable artifact transport/compatibility workflows.
- **Marketplace** = discovery mental model, currently powered by local/mock listings.

## Provenance-first package understanding

Entries now surface explicit local provenance:
- authored-local,
- imported-local,
- mock-published,
- installed-local,
- future-remote (reserved).

This keeps local workflows clear while mapping naturally to future hosted registry sources.

## What is intentionally deferred

- user auth/identity,
- remote registry/search infrastructure,
- social/engagement features,
- moderation/governance tooling.

## Sequencing posture

1. Preserve portable contracts and Android compatibility.
2. Strengthen local-first authoring + package workflows.
3. Grow registry/listing/query semantics locally.
4. Add hosted backend/auth integrations behind existing abstractions.

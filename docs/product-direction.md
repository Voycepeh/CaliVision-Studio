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

## PR11 direction: versioned and shareable local-first assets

PR11 extends PR10 with user-facing version/provenance semantics:

- **Library** = what is locally available to this Studio context.
- **Packages** = portable artifact transport/compatibility workflows.
- **Marketplace** = discovery mental model, currently powered by local/mock listings.
- **Fork/Remix** = derived package with explicit lineage to source package/version.
- **New Version** = same package lineage with incremented version/revision.
- **Duplicate** = local convenience copy, tracked with lightweight provenance.

## Provenance-first package understanding

Entries now surface explicit local provenance and lineage summaries:
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

# Android Compatibility

## Compatibility posture

Android remains the behavioral reference for package semantics. Studio must preserve portable package compatibility while adding publish groundwork.

## PR8 compatibility commitments

- Preserve canonical joint naming and normalized coordinates.
- Preserve explicit phase order and timing behavior.
- Preserve manifest-driven schema compatibility checks.
- Keep Studio export payloads Android-consumable.
- Treat `manifest.publishing` as additive metadata that Android can ignore safely.

## PR9 publishing compatibility posture

1. **Portable contract remains canonical**: publish workflow reads/writes package metadata but does not replace drill semantics.
2. **Additive metadata only**: `manifest.publishing` fields are optional and backward-compatible.
3. **Export compatibility preserved**: temporary local source-image refs are still stripped on export/artifact generation.
4. **Locator abstraction is host-ready, not runtime-coupled**: mock locators (`mock://...`) are for Studio simulation only.
5. **No backend dependencies introduced**: publish architecture is local/mock and deterministic.

## Canonical vs hosted metadata guidance

- Canonical portable fields stay in core manifest + drill/phase/pose structures.
- Hosted-platform concerns are represented as optional publishing metadata placeholders:
  - display copy (`title`, `summary`, `description`),
  - attribution (`authorDisplayName`),
  - discovery hints (`tags`, `categories`),
  - sharing intent (`visibility`, `publishStatus`),
  - artifact traceability (`latestArtifactChecksumSha256`, `lastPreparedAtIso`).

Android consumers should continue ignoring unknown optional fields per forward-compatible parsing behavior.

## Current baseline

- Contract baseline: `0.1.0`
- Producer source in sample fixtures: `web-studio`
- Sample payloads in `samples/` include additive publishing metadata placeholders for review.

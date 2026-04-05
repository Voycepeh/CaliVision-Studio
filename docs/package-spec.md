# Portable Drill Package Spec (Direction)

## Primary objects

- `DrillPackage`: top-level payload containing manifest, drill, and asset refs.
- `DrillManifest`: package metadata, schema version, producer source, consumer compatibility.
- `PortableDrill`: drill-level metadata and ordered phases.
- `PortablePhase`: timed segment with optional pose and asset refs.
- `PortablePose`: timestamped joint positions in a declared coordinate space.
- `PortableAssetRef`: URI and metadata for media dependencies.

## JSON schema orientation

PR1 defines TypeScript contracts first. Follow-up PRs should add formal JSON Schema documents generated from or aligned with these contracts.

Recommended schema IDs:
- `com.calivision.package.v0_1_0.drill-package`
- `com.calivision.package.v0_1_0.manifest`
- `com.calivision.package.v0_1_0.portable-drill`

## Compatibility rules (initial)

1. `manifest.schemaVersion` is required and semver-like.
2. Producers should set `manifest.source = "web-studio"` for authored packages.
3. Consumers should ignore unknown additive fields.
4. Breaking shape changes require a schema version bump and migration strategy.

## Versioning posture

- PR1 baseline: `0.1.0`
- Backward-compatible additions: patch/minor increment
- Breaking contract changes: next minor/major + migration notes

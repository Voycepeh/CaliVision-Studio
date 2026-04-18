# Android Compatibility

## Compatibility posture

Android remains the behavioral reference for package semantics. Schema updates in this pass are additive so existing Android/mobile drill import behavior remains safe.

Android runtime client reference: <https://github.com/Voycepeh/CaliVision>.

## Compatibility commitments

- Preserve canonical joint naming and normalized coordinate semantics.
- Preserve explicit phase order/timing behavior for authored playback.
- Preserve stable per-phase identity semantics (`phaseId`) as internal references separate from user-facing phase names (`name`).
- Preserve manifest-driven schema compatibility fields.
- Keep Studio export payloads Android-consumable.
- Treat new analysis blocks as additive metadata that can be ignored by runtime clients that do not yet consume them.
- Treat benchmark/reference metadata and phase comparison-rule metadata as additive and ignorable by runtime clients until adopted.

## Analysis schema v1 compatibility notes

1. **Artifact contract remains backward-compatible**
   - `PortableDrill.analysis` and `PortablePhase.analysis` are optional.
   - Older drill files without analysis metadata continue to validate/load.
2. **No runtime execution coupling introduced**
   - Rep/hold/hybrid analysis fields are intent metadata for Upload Video and future live-analysis flows, including bounded skip transitions for fast observations.
   - Authored playback timing and phase sequencing semantics are unchanged.
3. **Extensible placeholder shape only**
   - `matchHints` is typed but non-executing (no classifier runtime behavior added).
4. **Session result models are additive types**
   - `AnalysisSession`, `FramePhaseSample`, and `AnalysisEvent` define future output structures only.
5. **Legacy phase-id normalization remains backward-compatible**
   - Studio may normalize legacy generated IDs (`phase_top`, `phase_bottom`, `phase_new`) to stable opaque `phaseId` values during load.
   - Analysis wiring remains phase-id based, while semantic intent stays in explicit metadata such as `phase.analysis.semanticRole`.

## Current baseline

- Contract baseline: `0.1.0`
- `PortableDrill.drillType` remains required (`hold | rep`).
- `PortableDrill.title` remains the primary user-authored drill identity; legacy `slug` is tolerated on import but no longer required in Studio-authored payloads.
- `PortableDrill.analysis.measurementType` supports `rep | hold | hybrid` when present.
- `PortableDrill.benchmark` is optional/additive; legacy files without benchmark metadata continue to load.
- `PortablePhase.analysis.comparison` is optional/additive; legacy files without phase rules continue to load.
- Sample payloads now include rep, hold, and hybrid analysis examples while remaining portable.

## Benchmark schema foundation compatibility notes

1. **Optional drill-level block**
   - `PortableDrill.benchmark` is optional and normalizes to `null` when missing.
2. **No runtime coupling yet**
   - Benchmark metadata is schema/plumbing only in this pass (no side-by-side comparison runtime behavior).
3. **Phase mapping stays backward-compatible**
   - Benchmark phases are an additive normalized sequence and do not replace or mutate authored `PortablePhase` structures.

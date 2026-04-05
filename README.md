# CaliVision Studio

CaliVision Studio is the web-first authoring workspace for creating, editing, validating, and packaging drills that can be consumed by Android and future clients.

## Product vision

Build a single source of truth for drill creation with a NotebookLM-inspired dark workspace adapted for visual drill authoring. The Studio prioritizes information architecture, repeatable package generation, and compatibility-first workflow decisions.

## Why this exists separately from mobile

Mobile is optimized for consumption and guided execution, not high-throughput authoring. The Studio handles:
- multi-panel editing and review
- structured metadata and phase sequencing
- package validation and export controls
- future team collaboration and marketplace publishing

## Why web is the primary authoring surface

Web gives creators larger canvases, stronger keyboard/mouse ergonomics, and better support for dense editing interfaces. It also enables scalable tooling for schema evolution and packaging pipelines that are difficult to maintain directly inside a mobile runtime.

## Android/mobile package consumption model

The Android app consumes portable drill packages exported from Studio. PR1 establishes the TypeScript contract direction and JSON-oriented docs for:
- `DrillPackage`
- `DrillManifest`
- `PortableDrill`
- `PortablePhase`
- `PortablePose`
- `PortableAssetRef`

In this model, Android should parse versioned manifest data, then load drill + assets without re-implementing Studio authoring logic.

## Tech stack direction

- Next.js (App Router)
- React + TypeScript
- Minimal component architecture focused on layout clarity
- Local/mock data only for PR1

## Human-in-the-loop workflow

Studio intentionally keeps a human reviewer in control of:
1. metadata quality
2. phase sequencing
3. package validation before export
4. publish gating to library/marketplace

Automation (pose extraction, package checks) will augment this flow in later PRs.

## Future roadmap (high level)

1. Package IO (import/export round-trip)
2. Pose canvas and temporal editing tools
3. MediaPipe-assisted pose extraction
4. Marketplace publishing and discovery
5. Auth, team permissions, and cloud storage

## Getting started

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Initial route map

- `/` - project landing + route index
- `/studio` - 3-panel authoring shell
- `/library` - placeholder library page
- `/packages` - placeholder package workflow page
- `/marketplace` - placeholder marketplace page

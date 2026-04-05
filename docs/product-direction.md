# Product Direction

## Ownership boundaries

### Studio (web) responsibilities

Studio is the long-term system of record for:
- full drill authoring,
- phase sequencing and timing,
- pose/canvas editing,
- package validation,
- package export and future publishing.

### Mobile responsibilities (Android first, later iOS)

Mobile clients are runtime/live-coaching and drill consumption environments:
- load package payloads,
- execute drills during training,
- provide runtime cues and playback.

Mobile may support lightweight edits later (for example notes or labels), but full authoring remains web-first.

## Strategic constraints for this repo

- Do not build full marketplace behavior yet.
- Do not build live web coaching yet.
- Do not build full cloud upload/video processing yet.
- Keep contracts portable and Android-compatible first.

## Practical implication for PR sequencing

1. Lock a portable, versioned package contract.
2. Build reliable import/export + validation.
3. Add pose canvas and visual authoring depth.
4. Add package publishing/distribution flows.

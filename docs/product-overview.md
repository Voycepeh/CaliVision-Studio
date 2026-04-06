# Product Overview

## Mission

CaliVision-Studio is the web-first product surface for creating, refining, and publishing drill content as a **portable drill package**.

Studio is the ecosystem **source of truth** for authoring and package publishing. The Android app is the downstream **mobile runtime client** that imports and uses Studio-authored packages: <https://github.com/Voycepeh/CaliVision>.

## Product pillars

1. **Drill Studio**
   - visual drill/package authoring,
   - phase sequencing and editing,
   - pose extraction from images and manual refinement,
   - animation preview,
   - export for mobile import.

2. **Upload Video (browser direction)**
   - browser-based media upload and analysis,
   - reference generation and future drill drafting assistance,
   - future browser-side/cloud-assisted processing.

3. **Drill Exchange (future platform)**
   - account ownership,
   - hosted package storage,
   - share/discover drills,
   - fork/remix/version workflows,
   - package update/publish flows.

## What is current vs planned

### Available now / current target

- create a drill package,
- edit drill metadata,
- create/edit/reorder phases,
- upload phase image,
- detect and map pose into canonical format,
- manually refine phase pose,
- preview drill animation,
- export portable drill package.

### Planned / future target

- browser Upload Video analysis pipeline,
- hosted auth and account ownership,
- hosted package persistence and user libraries,
- Drill Exchange discovery/sharing,
- fork/remix/version and update/merge workflows,
- exchange-to-mobile import flows.

## Ecosystem role clarity

- **Studio repo (this repo):** authoring + upload-analysis + exchange/publishing direction.
- **Android repo:** runtime/live coaching client, package import/use. <https://github.com/Voycepeh/CaliVision>

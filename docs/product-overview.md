# Product Overview

## Mission

CaliVision Studio is the web-first source of truth for drill authoring and drill-first workflows.

Android runtime/live coaching client (downstream): <https://github.com/Voycepeh/CaliVision>.

## Product pillars

1. **Home:** brand-led landing page that introduces core flows and routes users into Library, Upload Video, or Android app download.
2. **Library:** primary workspace to create a new drill, continue Drafts, open My drills, import drill files, and browse Exchange.
3. **Drill Studio:** edit one drill draft at a time (metadata/phases, image-assisted detection/refinement, animation preview, export).
4. **Upload Video:** first-class local browser processing flow for queueing videos, MediaPipe pose analysis, overlay validation, and local artifact download.
5. **Drill Exchange:** discovery/sharing/versioning direction (currently local/mock-backed).

## Language model

- user-facing: **drill**
- technical portability: **package**
- discovery/share: **Drill Exchange**

> Note (April 2026): Studio now has initial Supabase hosted-draft/auth groundwork; public Exchange/publishing and mobile runtime remain separate concerns (mobile runtime: https://github.com/Voycepeh/CaliVision).

## Persistence UX direction (April 2026)

- User-facing storage concepts stay simple: **Drafts** and **My drills**.
- Signed out experience is browser/device local with explicit local-storage messaging.
- Signed in experience is account-hosted first; local browser persistence is resilience/fallback, not primary navigation.

# Storage and Media Model

## Purpose
This document defines what CaliVision Studio stores, where it stores it, and which storage areas are user-owned, admin-managed, or system-managed.

## Storage principles
1. Local-first should remain a core fallback.
2. Hosted persistence should enhance the product, not block basic use.
3. User-owned training data and admin-managed product media should remain clearly separated.
4. Media assets should use one reusable foundation instead of one-off storage paths.
5. Runtime analysis should store summaries before storing heavy raw media by default.
6. Secrets and service role access must stay server-side.

## Storage mode overview

| Mode | When used | Stores | User experience | Notes |
| --- | --- | --- | --- | --- |
| Local-only mode | Signed-out users or missing Supabase environment variables. | Local drills, drafts, and portable drill file/package state where supported. | Users can still author and use drills locally. | Should remain reliable and never feel broken. |
| Hosted mode | Signed in with Google and Supabase configured. | Hosted drills, hosted drafts, user profile/activity, and Drill Exchange participation where supported. | Account-backed persistence across devices. | Should keep RLS and ownership boundaries clear. |
| Admin-managed media mode | Admin/moderator manages product media. | Homepage branding images first, later shared media assets. | Normal users see product media; admins manage it. | Must remain separate from personal user training data. |
| Future session history mode | After session history implementation. | Attempt summaries, per-drill history, personal bests, and trend signals. | Progress tracking over time. | Store lightweight summaries first; heavy media is optional later. |

## Storage ownership model

| Storage area | Example contents | Owner | Visible to | Current status |
| --- | --- | --- | --- | --- |
| Browser local storage / IndexedDB | Signed-out drafts, local drills, local package snapshots. | Current browser profile. | Same browser profile only. | Active local-first foundation. |
| Supabase Auth | Google OAuth identity and session. | User account. | Signed-in user and server-side auth checks. | Active hosted foundation. |
| Supabase drill persistence | Hosted drafts, released drill versions, user-owned library entries. | Signed-in user. | Owner, and public only when explicitly published. | Active; should continue converging on a version-aware lifecycle. |
| Drill Exchange tables | Published drill snapshots, import/fork lineage, moderation status. | Publisher/admin depending on action. | Public active entries plus owner/admin controls. | Active but deprioritized for single-user-first MVP. |
| Supabase Storage + `media_assets` | Homepage branding images, future drill reference images, benchmark media, generated overlays. | Admin for branding; user or system for future personal assets. | Depends on scope and public flags. | Active foundation, with homepage branding as first use case. |
| `app_settings` | Homepage carousel duration in seconds. | Admin/system. | Server/client through safe read paths. | Active for carousel configuration. |
| Future session history tables | Attempt summaries, rep/hold metrics, failure reasons, personal bests. | Signed-in user, with local fallback if implemented. | Owner by default. | Planned. |
| Future heavy media/session storage | Raw recordings, annotated exports, generated videos. | User or system depending on workflow. | Owner by default unless explicitly shared. | Deferred. |

## Media asset scope model
The reusable media asset foundation should support scoped storage rather than one-off paths:

- **branding**: homepage carousel and product marketing assets.
- **drill**: phase reference images, authored drill media, preview images.
- **benchmark**: benchmark/reference videos, canonical movement clips.
- **session**: user attempt videos, screenshots, exported overlays.
- **generated**: AI-generated or system-generated assets such as generated drill visuals, thumbnails, or overlay composites.

Branding is the first active use case. Drill, benchmark, session, and generated assets should extend the same foundation where possible.

## Homepage carousel as first media use case
1. The 7 homepage images are product storytelling assets, not hardcoded marketing decoration.
2. They should be managed through Admin Media.
3. They should remain landscape-oriented and suitable for carousel display.
4. The carousel duration should be admin-configurable through `app_settings`.
5. If no active public branding images exist, the homepage should still work gracefully.
6. The 7-image story should align to this flow:
   - create drills
   - use built-ins or Drill Exchange
   - upload video
   - live coaching
   - overlay feedback
   - rep/hold review
   - progress over time

## User-owned vs admin-managed data

| Data type | User-owned? | Admin-managed? | Shareable? | Notes |
| --- | --- | --- | --- | --- |
| Personal drills | Yes | No | Yes, when explicitly published/shared. | Baseline authored content. |
| Local drafts | Yes (local browser profile) | No | Not by default. | Stays on current browser/device unless exported. |
| Hosted drafts | Yes | No | Not by default. | Private account-backed working state. |
| Released drill versions | Yes | No | Yes, based on publish/share action. | Versioned outputs from draft lifecycle. |
| Published Drill Exchange drills | Publisher-originated | Yes (moderation/admin controls) | Yes (public listing). | Shared discovery surface. |
| Homepage branding images | No | Yes | Public display when active/public. | Product storytelling media, not user training data. |
| Carousel settings | No | Yes | Not a user-sharing artifact. | `app_settings` controls like duration. |
| Future attempt summaries | Yes | No | Potentially, if user shares in future workflows. | Prioritize lightweight metrics/history first. |
| Future session recordings | Yes | Possibly (policy/compliance scope) | Optional and explicit. | Heavy media should remain opt-in. |
| Future generated media | User and/or system | Possibly, depending on generation flow | Optional and explicit. | Includes overlays, thumbnails, composites. |

## Recommended storage evolution
1. Stabilize the current local + hosted drill lifecycle.
2. Keep branding media as the first admin media success path.
3. Add attempt summary storage before raw session media storage.
4. Attach history to drill ID and drill version.
5. Add optional media attachments to attempts only after summaries are reliable.
6. Extend `media_assets` to drill, benchmark, session, and generated scopes.
7. Add cleanup/retention rules before storing large media by default.

## Non-goals for this PR
1. No new database tables.
2. No migration edits.
3. No Supabase policy changes.
4. No upload/storage implementation changes.
5. No app UI changes.
6. No analysis algorithm changes.

## Boundary note: Studio and Android runtime client
CaliVision Studio (this repository) remains the source-of-truth workspace for authoring drills, Upload Video analysis, exchange workflows, and storage foundations. The Android app is the optional native runtime/live-coaching specialization client: <https://github.com/Voycepeh/CaliVision>.

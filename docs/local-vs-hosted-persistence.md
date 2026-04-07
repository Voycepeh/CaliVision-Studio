# Local vs hosted persistence

## Local drafts (existing, still primary safety layer)

- Stored in browser IndexedDB.
- Autosaved continuously in Studio.
- Works offline/local-only.

## Hosted drafts (new)

- Require Supabase config + signed-in user.
- Saved manually via "Save to account".
- Available across sessions/devices for that user.

## Failure behavior

If hosted save/load/auth/network fails, local editing and local autosave remain intact.

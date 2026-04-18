# Supabase + Google Auth setup

CaliVision Studio supports two runtime modes:

- **Local-only mode (signed out or missing env vars):** drafts/library persistence stays in browser storage.
- **Hosted mode (signed in with Google):** Supabase-backed drafts/library is enabled for the signed-in user.

Android/mobile runtime responsibilities remain in the companion client: <https://github.com/Voycepeh/CaliVision>.

## 1) Environment variables

Copy `.env.example` to `.env.local`.

Required for hosted mode:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for admin user list, role management, and moderation endpoints)
- `EXCHANGE_MODERATOR_USER_IDS` (optional migration fallback only; DB-backed `user_profiles.role` is now primary)

Optional backward compatibility:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used only if `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is not set)

If these are missing, Studio keeps working in local-only mode and hosted controls remain disabled.

## 2) Supabase project configuration

1. Create a Supabase project.
2. In **Authentication → Providers**, enable **Google** provider.
3. Configure redirects in two places:
   - **Google Cloud → Authorized redirect URIs**: use the Supabase callback URL shown on the Supabase Google provider page (do not use your app URL here).
   - **Supabase Auth → Redirect URLs** (and your app `redirectTo`): allow your app callback routes, such as `http://localhost:3000/auth/callback` and your production `/auth/callback` URL.
4. Run SQL migrations:
   - `supabase/migrations/20260407_hosted_drafts_foundation.sql`
   - `supabase/migrations/20260412_exchange_mvp.sql`
   - `supabase/migrations/20260418_exchange_publication_moderation.sql`
   - `supabase/migrations/20260418_admin_user_profiles.sql`
5. For initial bootstrap, set one existing user profile to `admin` in `public.user_profiles` after that user signs in once (or after `/api/user/activity` creates their profile row).

## 3) Official Next.js auth flow used in Studio

Studio now follows the Supabase Next.js client/server auth pattern:

- browser client handles OAuth start, session read, and auth state updates,
- callback route exchanges OAuth `code` for a Supabase session,
- session hydration uses `supabase.auth.getSession()` / `onAuthStateChange()`,
- sign-out uses `supabase.auth.signOut()`.

No hand-rolled URL-fragment session parsing is used.

## 4) Key safety

Safe in browser code:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Never expose in browser code:

- Supabase service role key.

## 5) Auth scope for this milestone

- Studio uses **Google OAuth sign-in only**.
- No email/password auth.
- No Apple auth in this milestone.

## 6) Testing notes

### Localhost

1. `npm run dev`
2. Open `http://localhost:3000/library`.
3. Verify signed-out mode shows local-only behavior.
4. Click **Sign in with Google** and complete OAuth.
5. Verify callback returns to `/library` and hosted mode is active.

### Session continuity

- Refresh `/library` and confirm the session is still active.
- Close and reopen browser, then confirm the session is restored.
- Wait for access token expiry and confirm Supabase client refresh keeps session valid.

### Sign-out

- Click sign out and verify UI returns to local-only behavior.
- Verify hosted actions are no longer available.

### Env-missing fallback

- Remove Supabase env vars and restart dev server.
- Verify app still works in local-only mode with hosted controls disabled.

### Vercel

1. Add the same public env vars in Vercel project settings.
2. Add production callback URL in Supabase Google provider settings.
3. Deploy and repeat sign-in/session-refresh/sign-out checks on production domain.

## 7) Troubleshooting hosted save failures

If UI shows **"Hosted save failed: ..."**, use the appended backend payload to identify the real issue (constraint mismatch, RLS denial, auth token failure, etc.). In non-production mode Studio also logs `[hosted-drafts] save failed: ...` in the browser console for developer diagnostics.

Common checks:

- confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set in Vercel and local `.env.local`,
- confirm migration `20260407_hosted_drafts_foundation.sql` was applied,
- confirm signed-in user session is active before clicking **Save to account**.

Hosted draft writes rely on PostgREST upsert conflict keys `(owner_user_id, package_id, package_version)`. If a deployment is running older code without this conflict target, repeated saves for the same draft package/version can fail with a unique-constraint error.

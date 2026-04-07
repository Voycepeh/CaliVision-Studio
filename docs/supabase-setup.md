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

Optional backward compatibility:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used only if `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is not set)

If these are missing, Studio keeps working in local-only mode and hosted controls remain disabled.

## 2) Supabase project configuration

1. Create a Supabase project.
2. In **Authentication → Providers**, enable **Google** provider.
3. Configure Google OAuth credentials and callback URLs for:
   - local dev (`http://localhost:3000/library`),
   - production (your Vercel domain, e.g. `https://your-app.vercel.app/library`).
4. Run SQL migration: `supabase/migrations/20260407_hosted_drafts_foundation.sql`.

## 3) Key safety

Safe in browser code:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Never expose in browser code:

- Supabase service role key.

## 4) Auth behavior

- Studio uses **Google OAuth sign-in only**.
- No email/password auth.
- No Apple auth in this milestone.

## 5) Testing notes

### Localhost

1. `npm run dev`
2. Open `http://localhost:3000/library`.
3. Confirm signed-out mode shows local-only behavior.
4. Click **Sign in with Google** and complete OAuth.
5. Confirm returning to `/library` shows signed-in hosted capability.

### Vercel

1. Add the same public env vars in Vercel project settings.
2. Add production callback URL in Supabase Google provider settings.
3. Deploy and repeat sign-in/sign-out checks on the production domain.

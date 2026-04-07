# Supabase setup for CaliVision Studio hosted drafts

## Required environment variables

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

If these are missing, Studio runs in local-only mode and hosted UI is disabled gracefully.

## Database + storage setup

Apply `supabase/migrations/20260407_hosted_drafts_foundation.sql` to your Supabase project.

This migration creates:
- `public.hosted_drafts` table,
- RLS policies for owner-only access,
- trigger-based owner/update timestamps,
- `draft-assets` storage bucket.

## Auth flow

This PR uses Supabase email magic-link sign in.

- User clicks Sign in.
- User enters email.
- Supabase sends magic link.
- Return URL fragment is parsed client-side and session is stored locally.

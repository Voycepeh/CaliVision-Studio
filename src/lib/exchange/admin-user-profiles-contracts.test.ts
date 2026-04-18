import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260418_admin_user_profiles.sql", "utf8");

test("user profiles table includes role and activity fields", () => {
  assert.match(migration, /create table if not exists public\.user_profiles/i);
  assert.match(migration, /role text not null default 'user' check \(role in \('user', 'moderator', 'admin'\)\)/i);
  assert.match(migration, /last_active_at timestamptz/i);
});

test("is_exchange_moderator prefers database role source", () => {
  assert.match(migration, /from public\.user_profiles profile/i);
  assert.match(migration, /profile\.role in \('moderator', 'admin'\)/i);
});

test("self-service profile updates cannot mutate role", () => {
  assert.match(migration, /create or replace function public\.prevent_user_profile_role_self_escalation\(\)/i);
  assert.match(migration, /auth\.uid\(\) = old\.user_id/i);
  assert.match(migration, /new\.role is distinct from old\.role/i);
  assert.match(migration, /trg_prevent_user_profile_role_self_escalation/i);
});

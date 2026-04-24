import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260424_homepage_carousel_settings.sql", "utf8");

test("app settings migration creates homepage carousel duration setting", () => {
  assert.match(migration, /create table if not exists public\.app_settings/i);
  assert.match(migration, /setting_key text primary key/i);
  assert.match(migration, /insert into public\.app_settings \(setting_key, setting_value\)\s*values \('homepage_branding_carousel_duration_seconds', 7\)/i);
});

test("app settings migration exposes public select and moderator management policy", () => {
  assert.match(migration, /create policy "app_settings_public_homepage_select" on public\.app_settings/i);
  assert.match(migration, /create policy "app_settings_moderator_manage" on public\.app_settings/i);
});

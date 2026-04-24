import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260423_media_assets_foundation.sql", "utf8");

test("media assets table supports reusable media metadata", () => {
  assert.match(migration, /create table if not exists public\.media_assets/i);
  assert.match(migration, /kind text not null check \(kind in \('image', 'video', 'thumbnail', 'overlay'\)\)/i);
  assert.match(migration, /scope text not null check \(scope in \('branding', 'drill', 'benchmark', 'session', 'generated'\)\)/i);
  assert.match(migration, /display_order integer not null default 0/i);
});

test("branding bucket and public-select policy are provisioned", () => {
  assert.match(migration, /insert into storage\.buckets \(id, name, public\)\s*values \('branding-assets', 'branding-assets', true\)/i);
  assert.match(migration, /create policy "branding_assets_public_select" on storage\.objects/i);
});

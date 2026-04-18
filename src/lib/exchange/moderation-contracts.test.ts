import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260418_exchange_publication_moderation.sql", "utf8");

test("public exchange policy is restricted to published active entries", () => {
  assert.match(migration, /visibility_status = 'published' and is_active = true/);
});

test("owner update policy blocks owner transition to deleted visibility status", () => {
  assert.match(migration, /visibility_status in \('published', 'hidden', 'archived'\)/);
});

test("hard delete policy is moderator-only", () => {
  assert.match(migration, /exchange_publications_moderator_delete/);
  assert.match(migration, /for delete using \(public\.is_exchange_moderator\(\)\)/);
});

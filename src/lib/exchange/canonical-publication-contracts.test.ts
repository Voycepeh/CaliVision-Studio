import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260418_exchange_publication_canonical_identity.sql", "utf8");

test("canonical publication uniqueness is owner + source drill", () => {
  assert.match(migration, /drop index if exists exchange_publications_owner_source_version_idx;/i);
  assert.match(migration, /create unique index if not exists exchange_publications_owner_source_drill_idx\s+on public\.exchange_publications \(owner_user_id, source_drill_id\);/i);
});

test("migration deduplicates publications and remaps forks before deleting duplicates", () => {
  assert.match(migration, /update public\.exchange_forks[\s\S]*set published_drill_id = dp\.canonical_id/i);
  assert.match(migration, /delete from public\.exchange_publications[\s\S]*publication_rank > 1/i);
  assert.match(migration, /delete from public\.exchange_forks[\s\S]*fork_rank > 1/i);
});

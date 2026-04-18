import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repositorySource = readFileSync("src/lib/exchange/repository.ts", "utf8");

test("publishDrillToExchange resolves existing publication identity by owner + source drill", () => {
  assert.match(repositorySource, /owner_user_id=eq\.\$\{encodeURIComponent\(session\.user\.id\)\}&source_drill_id=eq\.\$\{encodeURIComponent\(input\.sourceVersion\.drillId\)\}/);
  assert.doesNotMatch(repositorySource, /source_version_id=eq\.\$\{encodeURIComponent\(input\.sourceVersion\.versionId\)\}/);
});

test("publishDrillToExchange upserts canonical publication rows by owner + source drill", () => {
  assert.match(repositorySource, /on_conflict=owner_user_id,source_drill_id/);
  assert.match(repositorySource, /source_drill_id:\s*input\.sourceVersion\.drillId/);
  assert.match(repositorySource, /source_version_id:\s*input\.sourceVersion\.versionId/);
});

test("listing reads dedupe canonical publication rows by owner + source drill", () => {
  assert.match(repositorySource, /function dedupeByCanonicalDrill\(/);
  assert.match(repositorySource, /const key = `\$\{publication\.ownerUserId\}:\$\{publication\.sourceDrillId\}`/);
  assert.match(repositorySource, /return \{ ok: true, value: dedupeByCanonicalDrill\(rows\.map\(mapRow\)\) \};/);
});

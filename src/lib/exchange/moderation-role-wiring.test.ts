import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moderationAuthSource = readFileSync("src/lib/exchange/moderation-auth.ts", "utf8");
const adminServerSource = readFileSync("src/lib/admin/server.ts", "utf8");

test("moderation role wiring prefers database role and falls back to auth metadata role", () => {
  assert.match(moderationAuthSource, /const profileRole = input\.profileRole === "admin" \|\| input\.profileRole === "moderator" \? input\.profileRole : "user"/);
  assert.match(moderationAuthSource, /const effectiveRole: ModerationRole = profileRole !== "user" \? profileRole : fallbackModerator \? fallbackRole : "user"/);
  assert.match(adminServerSource, /function coerceRoleFromSources\(profileRole: unknown, metadataRole: unknown\)/);
  assert.match(adminServerSource, /if \(databaseRole !== "user"\) return databaseRole/);
});

test("moderator controls are hidden for non-moderators in exchange surfaces", () => {
  const overview = readFileSync("src/components/library/MarketplaceOverview.tsx", "utf8");
  const detail = readFileSync("src/components/marketplace/MarketplaceDrillDetail.tsx", "utf8");

  assert.match(overview, /\{isModerator \? \(/);
  assert.match(detail, /\{isModerator \? \(/);
  assert.match(overview, /Remove from Exchange/);
  assert.match(detail, /Remove from Exchange/);
});

test("admin inspect drills panel includes publication metadata and moderator remove action", () => {
  const route = readFileSync("src/app/api/admin/users/[userId]/drills/route.ts", "utf8");
  const panel = readFileSync("src/components/admin/AdminPanel.tsx", "utf8");

  assert.match(route, /from\("exchange_publications"\)/);
  assert.match(route, /visibility_status, is_active, published_at, updated_at/);
  assert.match(panel, /Publication ID:/);
  assert.match(panel, /Remove from Exchange/);
  assert.match(panel, /action: "archive"/);
});

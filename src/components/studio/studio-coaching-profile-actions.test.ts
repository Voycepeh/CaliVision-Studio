import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const filePath = join(process.cwd(), "src/components/studio/StudioState.tsx");
const source = readFileSync(filePath, "utf8");

test("StudioState exposes setDrillCoachingProfile action", () => {
  assert.equal(source.includes("setDrillCoachingProfile: (partial: Partial<DrillCoachingProfile>) => void;"), true);
  assert.equal(source.includes("function setDrillCoachingProfile(partial: Partial<DrillCoachingProfile>): void"), true);
  assert.equal(source.includes("drill.coachingProfile = nextProfile;"), true);
});

test("StudioState clear action removes coachingProfile", () => {
  assert.equal(source.includes("clearDrillCoachingProfile: () => void;"), true);
  assert.equal(source.includes("function clearDrillCoachingProfile(): void"), true);
  assert.equal(source.includes("delete drill.coachingProfile;"), true);
});

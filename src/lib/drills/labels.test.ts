import test from "node:test";
import assert from "node:assert/strict";
import { buildDrillOptionLabel } from "./labels.ts";

test("buildDrillOptionLabel formats drill title/type/view", () => {
  assert.equal(
    buildDrillOptionLabel({
      drillId: "d1",
      slug: "d1",
      title: "Split Squat",
      drillType: "rep",
      difficulty: "beginner",
      tags: [],
      primaryView: "rear",
      phases: []
    }),
    "Split Squat · Rep · Rear"
  );
});

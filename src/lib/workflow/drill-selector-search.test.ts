import test from "node:test";
import assert from "node:assert/strict";
import { searchDrillsByOrigin } from "./drill-selector-search.ts";
import type { AvailableDrillDisplayOption } from "./available-drills";

const base = {
  sourceKind: "local" as const,
  sourceId: "x",
  packageVersion: "1.0.0",
  label: "",
  displayLabel: "",
  drill: {
    drillId: "",
    title: "",
    drillType: "rep" as const,
    difficulty: "beginner" as const,
    tags: [] as string[],
    primaryView: "side" as const,
    phases: []
  }
};

function option(input: {
  key: string;
  title: string;
  tags?: string[];
  drillType?: "hold" | "rep";
  difficulty?: "beginner" | "intermediate" | "advanced";
  primaryView?: "front" | "side" | "rear";
}): AvailableDrillDisplayOption {
  return {
    ...base,
    key: input.key,
    label: input.title,
    displayLabel: input.title,
    drill: {
      ...base.drill,
      drillId: input.key,
      title: input.title,
      tags: input.tags ?? [],
      drillType: input.drillType ?? "rep",
      difficulty: input.difficulty ?? "beginner",
      primaryView: input.primaryView ?? "side"
    }
  };
}

test("searchDrillsByOrigin ranks title matches before metadata-only matches", () => {
  const options = [
    option({ key: "a", title: "Handstand Hold", drillType: "hold" }),
    option({ key: "b", title: "Plank", tags: ["handstand"] })
  ];

  const results = searchDrillsByOrigin(options, "handstand");
  assert.equal(results.length, 2);
  assert.equal(results[0]?.option.key, "a");
  assert.equal(results[0]?.titleMatch, true);
  assert.equal(results[1]?.option.key, "b");
  assert.equal(results[1]?.metadataMatch, true);
});

test("searchDrillsByOrigin matches metadata fields", () => {
  const options = [option({ key: "a", title: "Front Lever", difficulty: "advanced", primaryView: "side" })];

  assert.equal(searchDrillsByOrigin(options, "advanced")[0]?.option.key, "a");
  assert.equal(searchDrillsByOrigin(options, "side")[0]?.option.key, "a");
  assert.equal(searchDrillsByOrigin(options, "rep")[0]?.option.key, "a");
});

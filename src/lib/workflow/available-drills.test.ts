import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDrillOptionGroups,
  ensureVisibleDrillSelection,
  resolveWorkflowDrillKey,
  type AvailableDrillOption
} from "./available-drill-selection.ts";

const baseDrill = {
  slug: "slug",
  drillType: "rep" as const,
  difficulty: "beginner" as const,
  tags: [] as string[],
  primaryView: "side" as const,
  phases: []
};

test("buildDrillOptionGroups groups by source and builds duplicate-safe labels", () => {
  const options: AvailableDrillOption[] = [
    { key: "local:a:d1", label: "Push Up · Rep · Side", sourceKind: "local", sourceId: "a", drill: { ...baseDrill, drillId: "d1", title: "Push Up" } },
    { key: "hosted:h:d1", label: "Push Up · Rep · Side", sourceKind: "hosted", sourceId: "h", drill: { ...baseDrill, drillId: "d1", title: "Push Up" } }
  ];

  const grouped = buildDrillOptionGroups(options);
  assert.equal(grouped.get("local")?.length, 1);
  assert.equal(grouped.get("cloud")?.length, 1);
  assert.match(grouped.get("local")?.[0]?.displayLabel ?? "", /local/i);
});

test("ensureVisibleDrillSelection falls back to first visible option", () => {
  const options: AvailableDrillOption[] = [
    { key: "local:a:d1", label: "One", sourceKind: "local", sourceId: "a", drill: { ...baseDrill, drillId: "d1", title: "One" } }
  ];
  const grouped = buildDrillOptionGroups(options);
  assert.equal(
    ensureVisibleDrillSelection({ selectedKey: "hosted:missing", selectedSource: "local", groupedOptions: grouped, fallbackKey: "freestyle" }),
    "local:a:d1"
  );
});

test("resolveWorkflowDrillKey uses requested key before current/stored and falls back", () => {
  const options: AvailableDrillOption[] = [
    { key: "local:a:d1", label: "One", sourceKind: "local", sourceId: "a", drill: { ...baseDrill, drillId: "d1", title: "One" } }
  ];
  assert.equal(
    resolveWorkflowDrillKey({ options, requestedDrillKey: "local:a:d1", currentKey: "nope", storageKey: "no-storage", fallbackKey: "freestyle" }),
    "local:a:d1"
  );
});

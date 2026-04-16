import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDrillOptionGroups,
  ensureVisibleDrillSelection,
  resolveSelectedSourceForKey,
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

test("resolveSelectedSourceForKey returns cloud for hosted selection even when default is local", () => {
  const options: AvailableDrillOption[] = [
    { key: "local:a:d1", label: "One", sourceKind: "local", sourceId: "a", drill: { ...baseDrill, drillId: "d1", title: "One" } },
    { key: "hosted:h:d2", label: "Two", sourceKind: "hosted", sourceId: "h", drill: { ...baseDrill, drillId: "d2", title: "Two" } }
  ];

  assert.equal(
    resolveSelectedSourceForKey({
      options,
      selectedKey: "hosted:h:d2",
      fallbackKey: "freestyle",
      defaultSource: "local"
    }),
    "cloud"
  );
});


test("drill origin stays selectable when no drill is selected", () => {
  const grouped = buildDrillOptionGroups([]);

  assert.equal(
    ensureVisibleDrillSelection({ selectedKey: "freestyle", selectedSource: "cloud", groupedOptions: grouped, fallbackKey: "freestyle" }),
    "freestyle"
  );
});

test("drill origin change keeps control editable by resolving drill selection explicitly", () => {
  const options: AvailableDrillOption[] = [
    { key: "local:a:d1", label: "Local One", sourceKind: "local", sourceId: "a", drill: { ...baseDrill, drillId: "d1", title: "Local One" } },
    { key: "hosted:h:d2", label: "Hosted Two", sourceKind: "hosted", sourceId: "h", drill: { ...baseDrill, drillId: "d2", title: "Hosted Two" } }
  ];
  const grouped = buildDrillOptionGroups(options);

  assert.equal(
    ensureVisibleDrillSelection({ selectedKey: "local:a:d1", selectedSource: "cloud", groupedOptions: grouped, fallbackKey: "freestyle" }),
    "hosted:h:d2"
  );
});

test("switching drills within an origin does not rewrite drill origin", () => {
  const options: AvailableDrillOption[] = [
    { key: "local:a:d1", label: "Local One", sourceKind: "local", sourceId: "a", drill: { ...baseDrill, drillId: "d1", title: "Local One" } },
    { key: "local:a:d3", label: "Local Three", sourceKind: "local", sourceId: "a", drill: { ...baseDrill, drillId: "d3", title: "Local Three" } },
    { key: "hosted:h:d2", label: "Hosted Two", sourceKind: "hosted", sourceId: "h", drill: { ...baseDrill, drillId: "d2", title: "Hosted Two" } }
  ];

  assert.equal(
    resolveSelectedSourceForKey({
      options,
      selectedKey: "local:a:d3",
      fallbackKey: "freestyle",
      defaultSource: "cloud"
    }),
    "local"
  );

  const grouped = buildDrillOptionGroups(options);
  assert.equal(
    ensureVisibleDrillSelection({ selectedKey: "local:a:d3", selectedSource: "local", groupedOptions: grouped, fallbackKey: "freestyle" }),
    "local:a:d3"
  );
});

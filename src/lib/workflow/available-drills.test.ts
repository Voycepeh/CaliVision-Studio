import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDrillOptionGroups,
  ensureVisibleDrillSelection,
  resolveSelectedSourceForKey,
  resolveWorkflowDrillKey,
  type AvailableDrillDisplayOption,
  type AvailableDrillOption
} from "./available-drill-selection.ts";
import { loadAvailableDrillOptions } from "./available-drills.ts";

const baseDrill = {
  slug: "slug",
  drillType: "rep" as const,
  difficulty: "beginner" as const,
  tags: [] as string[],
  primaryView: "side" as const,
  phases: []
};

test("buildDrillOptionGroups groups by source without cross-source title collisions", () => {
  const options: AvailableDrillOption[] = [
    { key: "local:a:d1", label: "Push Up · Rep · Side", sourceKind: "local", sourceId: "a", drill: { ...baseDrill, drillId: "d1", title: "Push Up" } },
    { key: "hosted:h:d1", label: "Push Up · Rep · Side", sourceKind: "hosted", sourceId: "h", drill: { ...baseDrill, drillId: "d1", title: "Push Up" } }
  ];

  const grouped = buildDrillOptionGroups(options);
  assert.equal(grouped.get("local")?.length, 1);
  assert.equal(grouped.get("cloud")?.length, 1);
  assert.equal(grouped.get("local")?.[0]?.displayLabel, "Push Up · Rep · Side");
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

test("public drills appear in exchange source bucket and remain isolated from local/cloud", () => {
  const options: AvailableDrillOption[] = [
    { key: "local:a:d1", label: "Local One", sourceKind: "local", sourceId: "a", drill: { ...baseDrill, drillId: "d1", title: "Local One" } },
    { key: "hosted:h:d2", label: "Hosted Two", sourceKind: "hosted", sourceId: "h", drill: { ...baseDrill, drillId: "d2", title: "Hosted Two" } },
    { key: "exchange:p:d3", label: "Public Three", sourceKind: "exchange", sourceId: "p", drill: { ...baseDrill, drillId: "d3", title: "Public Three" } }
  ];
  const grouped = buildDrillOptionGroups(options);

  assert.deepEqual((grouped.get("local") ?? []).map((item) => item.key), ["local:a:d1"]);
  assert.deepEqual((grouped.get("cloud") ?? []).map((item) => item.key), ["hosted:h:d2"]);
  assert.deepEqual((grouped.get("exchange") ?? []).map((item) => item.key), ["exchange:p:d3"]);
});

test("public drill key resolves back to exchange origin", () => {
  const options: AvailableDrillOption[] = [
    { key: "exchange:p:d3", label: "Public Three", sourceKind: "exchange", sourceId: "p", drill: { ...baseDrill, drillId: "d3", title: "Public Three" } }
  ];
  assert.equal(
    resolveSelectedSourceForKey({
      options,
      selectedKey: "exchange:p:d3",
      fallbackKey: "freestyle",
      defaultSource: "local"
    }),
    "exchange"
  );
});

test("duplicate same-source titles render unique labels with stable suffix", () => {
  const options: AvailableDrillOption[] = [
    { key: "local:a:d1", label: "Push Up · Rep · Side", sourceKind: "local", sourceId: "alpha", drill: { ...baseDrill, drillId: "d1", title: "Push Up" } },
    { key: "local:b:d2", label: "Push Up · Rep · Side", sourceKind: "local", sourceId: "bravo", drill: { ...baseDrill, drillId: "d2", title: "Push Up" } }
  ];
  const grouped = buildDrillOptionGroups(options);
  const labels = (grouped.get("local") ?? []).map((option: AvailableDrillDisplayOption) => option.displayLabel);
  assert.equal(labels.length, 2);
  assert.notEqual(labels[0], labels[1]);
  assert.match(labels[0] ?? "", /Local [a-z0-9]{4}$/i);
  assert.match(labels[1] ?? "", /Local [a-z0-9]{4}$/i);
});

test("available drill options only include released versions for upload/live flows", async () => {
  const readyVersion = {
    versionId: "ready-v1",
    packageJson: {
      manifest: { packageVersion: "0.1.1" },
      drills: [{ ...baseDrill, drillId: "ready-drill", title: "Ready Drill", benchmark: { sourceType: "reference_pose_sequence", phaseSequence: [] } }]
    }
  };
  const draftOnly = {
    drillId: "draft-only",
    title: "Draft Only",
    currentVersionId: "draft-v1",
    openDraftVersionId: "draft-v1",
    activeReadyVersionId: null,
    latestDraftVersionId: "draft-v1",
    currentVersion: { sourceId: "draft-v1", packageJson: { manifest: { packageVersion: "0.1.1" }, drills: [{ ...baseDrill, drillId: "draft-only", title: "Draft Only" }] } },
    activeReadyVersion: null,
    openDraftVersion: null,
    updatedAtIso: "2026-04-18T00:00:00.000Z"
  };
  const withReady = {
    ...draftOnly,
    drillId: "ready-drill",
    title: "Ready Drill",
    activeReadyVersionId: "ready-v1",
    activeReadyVersion: { ...readyVersion, sourceId: "ready-v1" }
  };

  const options = await loadAvailableDrillOptions(
    { session: null, isConfigured: false },
    {
      listDrills: async () => [withReady, draftOnly] as never,
      listExchange: async () => ({ ok: false, error: "skip" })
    }
  );

  assert.equal(options.length, 1);
  assert.equal(options[0]?.drill.drillId, "ready-drill");
});

test("released drills without benchmark are not automatically marked as legacy", async () => {
  const options = await loadAvailableDrillOptions(
    { session: null, isConfigured: false },
    {
      listDrills: async () =>
        [
          {
            drillId: "legacy-drill",
            title: "Legacy Drill",
            currentVersionId: "ready-v1",
            openDraftVersionId: null,
            activeReadyVersionId: "ready-v1",
            latestDraftVersionId: null,
            currentVersion: {
              sourceId: "ready-v1",
              packageJson: { manifest: { packageVersion: "0.1.1" }, drills: [{ ...baseDrill, drillId: "legacy-drill", title: "Legacy Drill" }] }
            },
            activeReadyVersion: {
              sourceId: "ready-v1",
              packageJson: { manifest: { packageVersion: "0.1.1" }, drills: [{ ...baseDrill, drillId: "legacy-drill", title: "Legacy Drill" }] }
            },
            openDraftVersion: null,
            updatedAtIso: "2026-04-18T00:00:00.000Z"
          }
        ] as never,
      listExchange: async () => ({ ok: false, error: "skip" })
    }
  );

  assert.equal(options[0]?.benchmarkState, "unavailable");
});

test("released drills with non-usable benchmark payload map to unavailable", async () => {
  const options = await loadAvailableDrillOptions(
    { session: null, isConfigured: false },
    {
      listDrills: async () =>
        [
          {
            drillId: "malformed-benchmark-drill",
            title: "Malformed Benchmark Drill",
            currentVersionId: "ready-v1",
            openDraftVersionId: null,
            activeReadyVersionId: "ready-v1",
            latestDraftVersionId: null,
            currentVersion: {
              sourceId: "ready-v1",
              packageJson: {
                manifest: { packageVersion: "0.1.1" },
                drills: [
                  {
                    ...baseDrill,
                    drillId: "malformed-benchmark-drill",
                    title: "Malformed Benchmark Drill",
                    benchmark: {
                      sourceType: "reference_pose_sequence",
                      phaseSequence: []
                    }
                  }
                ]
              }
            },
            activeReadyVersion: {
              sourceId: "ready-v1",
              packageJson: {
                manifest: { packageVersion: "0.1.1" },
                drills: [
                  {
                    ...baseDrill,
                    drillId: "malformed-benchmark-drill",
                    title: "Malformed Benchmark Drill",
                    benchmark: {
                      sourceType: "reference_pose_sequence",
                      phaseSequence: []
                    }
                  }
                ]
              }
            },
            openDraftVersion: null,
            updatedAtIso: "2026-04-18T00:00:00.000Z"
          }
        ] as never,
      listExchange: async () => ({ ok: false, error: "skip" })
    }
  );

  assert.equal(options[0]?.benchmarkState, "unavailable");
});

test("exchange drills with non-usable benchmark payload map to unavailable", async () => {
  const options = await loadAvailableDrillOptions(
    { session: null, isConfigured: false },
    {
      listDrills: async () => [] as never,
      listExchange: async () => ({
        ok: true,
        value: [
          {
            id: "publication-1",
            snapshotPackage: {
              manifest: { packageVersion: "1.0.0" },
              drills: [
                {
                  ...baseDrill,
                  drillId: "exchange-drill-1",
                  title: "Exchange Drill",
                  benchmark: {
                    sourceType: "reference_pose_sequence",
                    phaseSequence: []
                  }
                }
              ]
            }
          }
        ]
      })
    }
  );

  assert.equal(options[0]?.sourceKind, "exchange");
  assert.equal(options[0]?.benchmarkState, "unavailable");
});

test("available drill loading returns local and cloud source options with non-legacy missing benchmark state", async () => {
  const baseItem = {
    drillId: "drill-x",
    title: "Drill X",
    currentVersionId: "ready-v1",
    openDraftVersionId: null,
    activeReadyVersionId: "ready-v1",
    latestDraftVersionId: null,
    currentVersion: {
      sourceId: "ready-v1",
      packageJson: { manifest: { packageVersion: "0.1.1" }, drills: [{ ...baseDrill, drillId: "drill-x", title: "Drill X" }] }
    },
    activeReadyVersion: {
      sourceId: "ready-v1",
      packageJson: { manifest: { packageVersion: "0.1.1" }, drills: [{ ...baseDrill, drillId: "drill-x", title: "Drill X" }] }
    },
    openDraftVersion: null,
    updatedAtIso: "2026-04-18T00:00:00.000Z"
  };

  const localOptions = await loadAvailableDrillOptions(
    { session: null, isConfigured: false },
    {
      listDrills: async () => [baseItem] as never,
      listExchange: async () => ({ ok: false, error: "skip" })
    }
  );
  assert.equal(localOptions[0]?.sourceKind, "local");
  assert.equal(localOptions[0]?.benchmarkState, "unavailable");

  const cloudOptions = await loadAvailableDrillOptions(
    { session: { user: { id: "user-1" } }, isConfigured: true },
    {
      listDrills: async () => [baseItem] as never,
      listExchange: async () => ({ ok: false, error: "skip" })
    }
  );
  assert.equal(cloudOptions[0]?.sourceKind, "hosted");
  assert.equal(cloudOptions[0]?.benchmarkState, "unavailable");
});

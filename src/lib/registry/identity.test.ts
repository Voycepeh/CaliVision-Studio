import test from "node:test";
import assert from "node:assert/strict";
import { createArtifactId, createEntryId, upgradeLegacyEntryId } from "./identity.ts";

test("same package artifact can have distinct entry identities by provenance", () => {
  const authored = createEntryId({
    packageId: "com.example.drill",
    packageVersion: "1.0.0",
    sourceType: "authored-local",
    sourceLabel: "studio:working-copy"
  });

  const published = createEntryId({
    packageId: "com.example.drill",
    packageVersion: "1.0.0",
    sourceType: "mock-published",
    sourceLabel: "registry:listing"
  });

  assert.equal(createArtifactId("com.example.drill", "1.0.0"), "com.example.drill@1.0.0");
  assert.notEqual(authored, published);
});

test("install entry identity is distinct from source listing identity", () => {
  const source = createEntryId({
    packageId: "com.example.drill",
    packageVersion: "1.0.0",
    sourceType: "mock-published",
    sourceLabel: "registry:listing"
  });

  const installed = createEntryId({
    packageId: "com.example.drill",
    packageVersion: "1.0.0",
    sourceType: "installed-local",
    sourceLabel: `installed-from:${source}`,
    parentEntryId: source
  });

  assert.notEqual(source, installed);
  assert.match(installed, /installed-local/);
});

test("legacy id upgrade keeps new ids unchanged and migrates old artifact-only ids", () => {
  const sourceLabel = "studio:working-copy";
  const expected = createEntryId({
    packageId: "com.example.drill",
    packageVersion: "1.0.0",
    sourceType: "authored-local",
    sourceLabel
  });

  const upgraded = upgradeLegacyEntryId({
    entryId: "com.example.drill@1.0.0",
    packageId: "com.example.drill",
    packageVersion: "1.0.0",
    sourceType: "authored-local",
    sourceLabel
  });

  const unchanged = upgradeLegacyEntryId({
    entryId: expected,
    packageId: "com.example.drill",
    packageVersion: "1.0.0",
    sourceType: "authored-local",
    sourceLabel
  });

  assert.equal(upgraded, expected);
  assert.equal(unchanged, expected);
});

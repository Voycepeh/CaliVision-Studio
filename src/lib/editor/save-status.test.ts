import assert from "node:assert/strict";
import test from "node:test";
import { deriveEditorSaveStatus } from "./save-status.ts";

test("clean cloud draft after save reports only saved to account", () => {
  const status = deriveEditorSaveStatus({
    workspace: "cloud",
    isDirty: false,
    isSaving: false,
    hasError: false,
    lastSavedAtIso: "2026-04-10T10:20:30.000Z"
  });

  assert.equal(status.kind, "saved");
  assert.match(status.label, /^Saved to account at /);
  assert.doesNotMatch(status.label, /Unsaved/);
});

test("edited cloud draft reports only unsaved cloud changes", () => {
  const status = deriveEditorSaveStatus({
    workspace: "cloud",
    isDirty: true,
    isSaving: false,
    hasError: false,
    lastSavedAtIso: "2026-04-10T10:20:30.000Z"
  });

  assert.equal(status.kind, "unsaved");
  assert.equal(status.label, "Unsaved cloud changes");
  assert.doesNotMatch(status.label, /Saved to account/);
});

test("clean local draft reports saved locally wording", () => {
  const status = deriveEditorSaveStatus({
    workspace: "local",
    isDirty: false,
    isSaving: false,
    hasError: false,
    lastSavedAtIso: "2026-04-10T10:20:30.000Z"
  });

  assert.equal(status.kind, "saved");
  assert.match(status.label, /^Saved locally at /);
  assert.doesNotMatch(status.label, /Saved to account/);
});

test("hydration of unchanged draft does not show unsaved", () => {
  const status = deriveEditorSaveStatus({
    workspace: "local",
    isDirty: false,
    isSaving: false,
    hasError: false,
    lastSavedAtIso: "2026-04-10T10:20:30.000Z"
  });

  assert.doesNotMatch(status.label, /Unsaved/);
  assert.match(status.label, /^Saved locally at /);
});

test("successful save clears unsaved state", () => {
  const beforeSave = deriveEditorSaveStatus({
    workspace: "cloud",
    isDirty: true,
    isSaving: false,
    hasError: false,
    lastSavedAtIso: "2026-04-10T10:20:30.000Z"
  });
  assert.equal(beforeSave.label, "Unsaved cloud changes");

  const afterSave = deriveEditorSaveStatus({
    workspace: "cloud",
    isDirty: false,
    isSaving: false,
    hasError: false,
    lastSavedAtIso: "2026-04-10T11:20:30.000Z"
  });
  assert.match(afterSave.label, /^Saved to account at /);
});

test("saving and error states stay mutually exclusive and primary", () => {
  const saving = deriveEditorSaveStatus({
    workspace: "local",
    isDirty: true,
    isSaving: true,
    hasError: false,
    lastSavedAtIso: "2026-04-10T10:20:30.000Z"
  });

  assert.equal(saving.label, "Saving...");

  const failed = deriveEditorSaveStatus({
    workspace: "cloud",
    isDirty: false,
    isSaving: false,
    hasError: true,
    lastSavedAtIso: "2026-04-10T10:20:30.000Z"
  });

  assert.equal(failed.label, "Save failed / retry needed");
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const studioStatePath = join(process.cwd(), "src/components/studio/StudioState.tsx");
const studioActionBarPath = join(process.cwd(), "src/components/studio/StudioActionBar.tsx");
const studioMetadataEditorPath = join(process.cwd(), "src/components/studio/StudioMetadataEditor.tsx");
const studioStateSource = readFileSync(studioStatePath, "utf8");
const studioActionBarSource = readFileSync(studioActionBarPath, "utf8");
const studioMetadataEditorSource = readFileSync(studioMetadataEditorPath, "utf8");

test("StudioState saves full drill package (including coachingProfile) to cloud and local payloads", () => {
  assert.equal(studioStateSource.includes("const upsert = await upsertHostedLibraryItem(session, selectedPackage.workingPackage);"), true);
  assert.equal(studioStateSource.includes("packageJson: selectedPackage.workingPackage,"), true);
});

test("StudioState guards browser leave when draft has unsaved changes", () => {
  assert.equal(studioStateSource.includes("window.addEventListener(\"beforeunload\", handleBeforeUnload);"), true);
  assert.equal(studioStateSource.includes("event.returnValue = \"\";"), true);
});

test("Studio action bar confirms unsaved changes before leaving Drill Studio", () => {
  assert.equal(studioActionBarSource.includes("You have unsaved changes. Leave Drill Studio without saving?"), true);
  assert.equal(studioActionBarSource.includes("router.push(\"/library\");"), true);
});

test("Studio metadata editor renders Coaching Profile values from saved drill metadata", () => {
  assert.equal(studioMetadataEditorSource.includes("const profile = drill.coachingProfile;"), true);
  assert.equal(studioMetadataEditorSource.includes("value={profile?.movementFamily ?? \"\"}"), true);
  assert.equal(studioMetadataEditorSource.includes("value={profile?.rulesetId ?? \"none\"}"), true);
  assert.equal(studioMetadataEditorSource.includes("value={profile?.supportType ?? \"\"}"), true);
});

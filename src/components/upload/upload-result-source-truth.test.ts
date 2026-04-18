import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const uploadWorkspaceSource = readFileSync(new URL("./UploadVideoWorkspace.tsx", import.meta.url), "utf8");

test("raw preview source uses normalized analysis file when present", () => {
  assert.match(
    uploadWorkspaceSource,
    /const rawPreviewFile = activeJob\.artefacts\?\.analysisVideoFile \?\? activeJob\.file;/,
    "expected raw preview to resolve from analysisVideoFile fallback to original file"
  );
});

test("raw download uses the same source file shown in Raw preview", () => {
  assert.match(
    uploadWorkspaceSource,
    /downloadBlob\(activeJob\.artefacts\?\.analysisVideoFile \?\? activeJob\.file, rawPreviewFileName \?\? activeJob\.fileName\)/,
    "expected raw download to use resolved raw preview source and filename"
  );
});

test("completed preview defaults to annotated surface", () => {
  assert.match(
    uploadWorkspaceSource,
    /useState<PreviewSurface>\("annotated"\)/,
    "expected completed preview to default to annotated surface to avoid initial source mismatch"
  );
});

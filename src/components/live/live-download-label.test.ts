import test from "node:test";
import assert from "node:assert/strict";
import { resolveLiveDownloadLabel } from "../../lib/media/download-labels.ts";

test("resolveLiveDownloadLabel returns one canonical label per state", () => {
  assert.equal(resolveLiveDownloadLabel({ kind: "annotated", downloadable: true }), "Download annotated");
  assert.equal(resolveLiveDownloadLabel({ kind: "annotated", downloadable: false }), "Download annotated WebM (may not play)");
  assert.equal(resolveLiveDownloadLabel({ kind: "raw", downloadable: true }), "Download raw");
  assert.equal(resolveLiveDownloadLabel({ kind: "raw", downloadable: false }), "Download raw WebM (may not play)");
});

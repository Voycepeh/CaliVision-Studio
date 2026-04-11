import test from "node:test";
import assert from "node:assert/strict";
import { resolveUploadDownloadLabel } from "../../lib/media/download-labels.ts";

test("resolveUploadDownloadLabel returns one canonical label per state", () => {
  assert.equal(resolveUploadDownloadLabel({ kind: "annotated", downloadable: true }), "Download Annotated Video");
  assert.equal(resolveUploadDownloadLabel({ kind: "annotated", downloadable: false }), "Download Annotated WebM (may not play on this device)");
  assert.equal(resolveUploadDownloadLabel({ kind: "raw", downloadable: true }), "Download Raw Video");
  assert.equal(resolveUploadDownloadLabel({ kind: "raw", downloadable: false }), "Download Raw WebM (may not play on this device)");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  detectDeliveryFormat,
  resolveSafeDelivery,
  selectPreferredCaptureMimeType,
  selectPreviewSource
} from "./media-capabilities.ts";

test("selectPreferredCaptureMimeType chooses first supported candidate", () => {
  const selected = selectPreferredCaptureMimeType((candidate) => candidate === "video/webm;codecs=vp9");
  assert.equal(selected, "video/webm;codecs=vp9");
});

test("detectDeliveryFormat never maps webm to mp4", () => {
  assert.equal(detectDeliveryFormat("video/webm;codecs=vp9"), "webm");
  assert.notEqual(detectDeliveryFormat("video/webm"), "mp4");
});

test("selectPreviewSource blocks unsupported apple-like webm-only preview", () => {
  const selection = selectPreviewSource({
    preferredId: "annotated",
    isAppleLike: true,
    canPlayType: () => "",
    sources: [{ id: "annotated", url: "blob:1", mimeType: "video/webm" }]
  });

  assert.equal(selection.source, null);
  assert.equal(selection.blockedByCompatibility, true);
  assert.match(selection.warning ?? "", /may not play WebM reliably/i);
});

test("resolveSafeDelivery disables apple-like webm-only download", () => {
  const safety = resolveSafeDelivery({
    mimeType: "video/webm",
    isAppleLike: true,
    canPlayType: () => ""
  });

  assert.equal(safety.downloadable, false);
  assert.equal(safety.format, "webm");
  assert.match(safety.warning ?? "", /may not play/i);
});

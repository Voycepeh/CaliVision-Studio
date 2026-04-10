import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBrowserMediaCapabilities,
  canPlayVideoMimeType,
  extensionForVideoMimeType,
  isUserFacingDeliveryAllowed
} from "./video-capabilities.ts";

test("prefers mp4 capture when recorder supports mp4", () => {
  const capabilities = buildBrowserMediaCapabilities({
    mediaRecorderIsTypeSupported: (mimeType) => mimeType.startsWith("video/mp4"),
    canPlayType: () => true
  });

  assert.equal(capabilities.capture.preferredMimeType, "video/mp4;codecs=avc1.42E01E");
  assert.equal(capabilities.capture.preferredExtension, "mp4");
  assert.equal(capabilities.delivery.preferredFamily, "mp4");
});

test("falls back to webm capture when mp4 recording is unavailable", () => {
  const capabilities = buildBrowserMediaCapabilities({
    mediaRecorderIsTypeSupported: (mimeType) => mimeType.includes("webm"),
    canPlayType: (mimeType) => mimeType.includes("mp4")
  });

  assert.equal(capabilities.capture.preferredMimeType, "video/webm;codecs=vp9");
  assert.equal(capabilities.capture.preferredExtension, "webm");
  assert.equal(capabilities.delivery.preferredFamily, "mp4");
});

test("does not treat webm as safe delivery when browser cannot play webm", () => {
  assert.equal(
    isUserFacingDeliveryAllowed("video/webm", {
      canPlayType: () => false
    }),
    false
  );
  assert.equal(extensionForVideoMimeType("video/webm;codecs=vp9"), "webm");
  assert.equal(extensionForVideoMimeType("video/mp4"), "mp4");
  assert.equal(canPlayVideoMimeType("video/mp4", { canPlayType: () => true }), true);
});

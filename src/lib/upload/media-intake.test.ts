import test from "node:test";
import assert from "node:assert/strict";
import { createUploadMediaIntake } from "./media-intake.ts";

test("createUploadMediaIntake normalizes uploaded files", () => {
  const file = new File(["video-data"], "attempt.mp4", { type: "video/mp4" });
  const intake = createUploadMediaIntake({ sourceType: "file", file });

  assert.equal(intake.fileName, "attempt.mp4");
  assert.equal(intake.sourceType, "file");
  assert.equal(intake.sourceLabel, "Uploaded file");
  assert.equal(intake.fileSizeBytes, file.size);
});

test("createUploadMediaIntake provides camera label for browser recordings", () => {
  const file = new File(["video-data"], "capture.webm", { type: "video/webm" });
  const intake = createUploadMediaIntake({ sourceType: "browser-recording", file });

  assert.equal(intake.sourceLabel, "Browser camera recording");
});

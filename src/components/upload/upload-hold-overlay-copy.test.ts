import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const overlaySource = readFileSync(join(process.cwd(), "src/lib/upload/overlay.ts"), "utf8");

test("hold-only overlay copy includes hold totals and no rep fallback branch", () => {
  assert.equal(overlaySource.includes("Hold total:"), true);
  assert.equal(overlaySource.includes("Best hold:"), true);
  assert.equal(overlaySource.includes("showHoldTimer && !replayOverlayState.showRepCount"), true);
});

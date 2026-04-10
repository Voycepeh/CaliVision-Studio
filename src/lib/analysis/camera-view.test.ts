import test from "node:test";
import assert from "node:assert/strict";
import { resolveDrillCameraView, resolveDrillCameraViewWithDiagnostics } from "./camera-view.ts";

test("resolveDrillCameraView normalizes casing and aliases", () => {
  assert.equal(resolveDrillCameraView({ primaryView: "FRONT" } as never), "front");
  assert.equal(resolveDrillCameraView({ primaryView: "Side" } as never), "side");
  assert.equal(resolveDrillCameraView({ primaryView: "rear" } as never), "side");
});

test("resolveDrillCameraViewWithDiagnostics warns on missing/invalid values", () => {
  const resolved = resolveDrillCameraViewWithDiagnostics({ primaryView: "unknown", drillId: "d1", title: "Drill" } as never);
  assert.equal(resolved.cameraView, "front");
  assert.equal(resolved.diagnostics.usedFallback, true);
  assert.match(resolved.diagnostics.warning ?? "", /defaulting to front/i);
});


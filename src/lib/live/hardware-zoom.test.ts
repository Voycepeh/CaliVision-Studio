import assert from "node:assert/strict";
import test from "node:test";
import { applyHardwareZoom, clampHardwareZoomValue, formatHardwareZoomLabel, getHardwareZoomSupport } from "./hardware-zoom.ts";

test("getHardwareZoomSupport returns unsupported when zoom capability is absent", () => {
  const support = getHardwareZoomSupport({
    getCapabilities: () => ({})
  });
  assert.deepEqual(support, { supported: false });
});

test("getHardwareZoomSupport returns clamped settings and defaults step", () => {
  const support = getHardwareZoomSupport({
    getCapabilities: () => ({ zoom: { min: 1, max: 3 } }),
    getSettings: () => ({ zoom: 4.2 })
  });

  assert.deepEqual(support, {
    supported: true,
    min: 1,
    max: 3,
    step: 0.1,
    current: 3
  });
});

test("clampHardwareZoomValue snaps to supported step", () => {
  const value = clampHardwareZoomValue(1.37, { supported: true, min: 1, max: 2, step: 0.2, current: 1 });
  assert.equal(value, 1.4);
});

test("applyHardwareZoom applies advanced zoom constraint and returns realized setting", async () => {
  let lastZoom = 1;
  const track = {
    getSettings: () => ({ zoom: lastZoom }),
    applyConstraints: async (constraints: MediaTrackConstraints) => {
      lastZoom = Number((constraints.advanced?.[0] as { zoom?: number } | undefined)?.zoom ?? 1);
    }
  };

  const applied = await applyHardwareZoom(track, 2.9, { supported: true, min: 1, max: 2, step: 0.5, current: 1 });
  assert.equal(lastZoom, 2);
  assert.equal(applied, 2);
});

test("formatHardwareZoomLabel formats one decimal place", () => {
  assert.equal(formatHardwareZoomLabel(1), "1.0x");
  assert.equal(formatHardwareZoomLabel(1.26), "1.3x");
});

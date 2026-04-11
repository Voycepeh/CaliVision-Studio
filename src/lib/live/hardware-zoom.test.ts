import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_HARDWARE_ZOOM_PRESETS,
  applyHardwareZoom,
  applyHardwareZoomPreset,
  clampHardwareZoomValue,
  formatHardwareZoomLabel,
  getHardwareZoomSupport,
  getSupportedZoomPresets,
  resolveSelectedZoomPreset
} from "./hardware-zoom.ts";

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

test("getSupportedZoomPresets filters app presets by capability range and step", () => {
  const supported = getSupportedZoomPresets({ supported: true, min: 0.8, max: 1.6, step: 0.1, current: 1 });
  assert.deepEqual(supported, [1, 1.2, 1.5]);
});

test("getSupportedZoomPresets returns empty for unsupported tracks", () => {
  assert.deepEqual(getSupportedZoomPresets({ supported: false }, APP_HARDWARE_ZOOM_PRESETS), []);
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

test("applyHardwareZoomPreset snaps to nearest valid step before apply", async () => {
  let lastZoom = 1;
  const track = {
    getSettings: () => ({ zoom: lastZoom }),
    applyConstraints: async (constraints: MediaTrackConstraints) => {
      lastZoom = Number((constraints.advanced?.[0] as { zoom?: number } | undefined)?.zoom ?? 1);
    }
  };

  const applied = await applyHardwareZoomPreset(track, 1.25, { supported: true, min: 1, max: 2, step: 0.2, current: 1 });
  assert.equal(lastZoom, 1.2);
  assert.equal(applied, 1.2);
});

test("resolveSelectedZoomPreset returns only exact applied preset matches", () => {
  assert.equal(resolveSelectedZoomPreset(1.25, [1, 1.25, 1.5]), 1.25);
  assert.equal(resolveSelectedZoomPreset(1.2, [1, 1.25, 1.5]), null);
});

test("formatHardwareZoomLabel formats one decimal place", () => {
  assert.equal(formatHardwareZoomLabel(1), "1x");
  assert.equal(formatHardwareZoomLabel(1.26), "1.26x");
});

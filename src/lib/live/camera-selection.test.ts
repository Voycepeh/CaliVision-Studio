import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseBestRearCameraForZoomPreset,
  chooseBestRearMainCamera,
  inferCameraFacingFromLabelOrSettings,
  probeVideoDeviceCapabilities,
  resolveHalfXAccessDecision,
  replaceStreamSafely,
  type VideoInputDescriptor
} from "./camera-selection.ts";

test("0.5 preset uses hardware zoom when active track min includes 0.5", () => {
  const decision = chooseBestRearCameraForZoomPreset(
    0.5,
    [],
    {
      deviceId: "rear-main",
      facing: "rear",
      zoomSupport: { supported: true, min: 0.5, max: 2, step: 0.1, current: 1 }
    }
  );

  assert.deepEqual(decision, { strategy: "hardware-zoom", reason: "active-track-supports-preset" });
});

test("0.5 preset switches camera when active track min is 1 and ultrawide candidate exists", () => {
  const candidates: VideoInputDescriptor[] = [
    {
      deviceId: "rear-ultra",
      label: "Back Ultra Wide Camera",
      facing: "rear",
      rearLensHint: "ultrawide",
      zoomSupport: { supported: false }
    }
  ];

  const decision = chooseBestRearCameraForZoomPreset(0.5, candidates, {
    deviceId: "rear-main",
    facing: "rear",
    zoomSupport: { supported: true, min: 1, max: 3, step: 0.1, current: 1 }
  });

  assert.equal(decision.strategy, "switch-camera");
  if (decision.strategy === "switch-camera") {
    assert.equal(decision.camera.deviceId, "rear-ultra");
  }
});

test("0.5 preset is unavailable when active track min is 1 and no ultrawide candidate exists", () => {
  const decision = chooseBestRearCameraForZoomPreset(
    0.5,
    [
      {
        deviceId: "rear-main-2",
        label: "Rear Main",
        facing: "rear",
        rearLensHint: "main",
        zoomSupport: { supported: true, min: 1, max: 2, step: 0.1, current: 1 }
      }
    ],
    {
      deviceId: "rear-main",
      facing: "rear",
      zoomSupport: { supported: true, min: 1, max: 3, step: 0.1, current: 1 }
    }
  );

  assert.deepEqual(decision, { strategy: "unavailable", reason: "no_confident_ultrawide_candidate" });
});

test("preset logic remains on active hardware path for 1.25x", () => {
  const decision = chooseBestRearCameraForZoomPreset(
    1.25,
    [],
    {
      deviceId: "rear-main",
      facing: "rear",
      zoomSupport: { supported: true, min: 1, max: 3, step: 0.1, current: 1 }
    }
  );

  assert.deepEqual(decision, { strategy: "hardware-zoom", reason: "active-track-supports-preset" });
});

test("supports floating tolerance for 0.5 capability checks", () => {
  const decision = chooseBestRearCameraForZoomPreset(
    0.5,
    [],
    {
      deviceId: "rear-main",
      facing: "rear",
      zoomSupport: { supported: true, min: 0.5009, max: 2, step: 0.1, current: 1 }
    }
  );

  assert.equal(decision.strategy, "hardware-zoom");
});

test("inferCameraFacingFromLabelOrSettings infers rear from labels and settings", () => {
  assert.equal(inferCameraFacingFromLabelOrSettings("Back Camera"), "rear");
  assert.equal(inferCameraFacingFromLabelOrSettings("", { facingMode: "user" }), "front");
});

test("resolveHalfXAccessDecision reports unavailable when no hardware or ultrawide path exists", () => {
  const decision = resolveHalfXAccessDecision(
    [
      {
        deviceId: "rear-main",
        label: "Rear Main Camera",
        facing: "rear",
        rearLensHint: "main",
        zoomSupport: { supported: true, min: 1, max: 2, step: 0.1, current: 1 }
      }
    ],
    {
      deviceId: "rear-main",
      facing: "rear",
      zoomSupport: { supported: true, min: 1, max: 2, step: 0.1, current: 1 }
    }
  );
  assert.equal(decision.available, false);
});

test("probeVideoDeviceCapabilities stops probe tracks", async () => {
  let stopCount = 0;
  const track = {
    readyState: "live",
    stop: () => {
      stopCount += 1;
    },
    getSettings: () => ({ facingMode: "environment", zoom: 1 }),
    getCapabilities: () => ({ zoom: { min: 1, max: 2, step: 0.1 } })
  } as unknown as MediaStreamTrack;

  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track]
  } as unknown as MediaStream;

  const result = await probeVideoDeviceCapabilities("rear-main", {
    getUserMedia: async () => stream
  });

  assert.equal(result.facing, "rear");
  assert.equal(result.zoomSupport.supported, true);
  assert.equal(stopCount, 1);
});

test("replaceStreamSafely stops previous stream tracks before replacing", async () => {
  let stopCalledWithPrevious = false;
  const previous = { id: "previous-stream" } as unknown as MediaStream;
  const next = { id: "next-stream" } as unknown as MediaStream;

  const result = await replaceStreamSafely(previous, next, async (stream) => {
    stopCalledWithPrevious = stream === previous;
  });

  assert.equal(stopCalledWithPrevious, true);
  assert.equal(result, next);
});

test("chooseBestRearMainCamera returns a main rear candidate for switching back from ultrawide", () => {
  const decision = chooseBestRearMainCamera(
    [
      {
        deviceId: "rear-main",
        label: "Rear Main Camera",
        facing: "rear",
        rearLensHint: "main",
        zoomSupport: { supported: true, min: 1, max: 3, step: 0.1, current: 1 }
      },
      {
        deviceId: "rear-ultra",
        label: "Rear Ultra Wide Camera",
        facing: "rear",
        rearLensHint: "ultrawide",
        zoomSupport: { supported: false }
      }
    ],
    "rear-ultra"
  );
  assert.equal(decision.strategy, "switch-camera");
  if (decision.strategy === "switch-camera") {
    assert.equal(decision.camera.deviceId, "rear-main");
  }
});

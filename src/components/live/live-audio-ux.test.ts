import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const live = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");

test("live audio toggle uses explicit Off / Ready / On labels", () => {
  assert.ok(live.includes("Audio cues: {!liveAudioEnabled ? \"Off\" : isLiveAudioPrimed ? \"On\" : \"Ready: tap to enable\"}"));
});

test("live cockpit exposes a compact test sound action when audio is supported", () => {
  assert.ok(live.includes("Test sound"));
  assert.ok(live.includes("void playTestSound()"));
  assert.ok(live.includes("{isLiveAudioSupported ? ("));
});

test("live audio helper text explains cue trigger timing before first rep/hold cue", () => {
  assert.ok(live.includes("Sound is on. Cues play when reps complete or holds start."));
});

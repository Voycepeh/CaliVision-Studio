import assert from "node:assert/strict";
import test from "node:test";
import { formatDurationClock, formatDurationStopwatch, toFiniteNonNegativeMs } from "./safe-duration.ts";

test("toFiniteNonNegativeMs guards invalid numbers", () => {
  assert.equal(toFiniteNonNegativeMs(undefined), null);
  assert.equal(toFiniteNonNegativeMs(Number.NaN), null);
  assert.equal(toFiniteNonNegativeMs(Number.POSITIVE_INFINITY), null);
  assert.equal(toFiniteNonNegativeMs(-1), null);
  assert.equal(toFiniteNonNegativeMs(1200), 1200);
});

test("formatDurationClock formats with safe fallback", () => {
  assert.equal(formatDurationClock(62000), "1m 02s");
  assert.equal(formatDurationClock(1200), "1s");
  assert.equal(formatDurationClock(Number.NaN), "Duration unavailable");
});

test("formatDurationStopwatch formats stopwatch view with safe fallback", () => {
  assert.equal(formatDurationStopwatch(2500), "2.5s");
  assert.equal(formatDurationStopwatch(62000), "1:02");
  assert.equal(formatDurationStopwatch(null), "Duration unavailable");
});

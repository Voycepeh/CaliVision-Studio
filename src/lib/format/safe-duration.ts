export function toFiniteNonNegativeMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function formatDurationClock(durationMs: unknown, fallback = "Duration unavailable"): string {
  const safeMs = toFiniteNonNegativeMs(durationMs);
  if (safeMs === null) {
    return fallback;
  }
  const seconds = Math.max(0, Math.round(safeMs / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export function formatDurationStopwatch(durationMs: unknown, fallback = "Duration unavailable"): string {
  const safeMs = toFiniteNonNegativeMs(durationMs);
  if (safeMs === null) {
    return fallback;
  }
  const totalSeconds = safeMs / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const floored = Math.floor(totalSeconds);
  const minutes = Math.floor(floored / 60);
  const seconds = floored % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

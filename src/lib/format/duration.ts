export function formatDurationShort(durationMs: number): string {
  if (!Number.isFinite(durationMs)) {
    return "0s";
  }

  const safeMs = Math.max(0, durationMs);
  const seconds = safeMs / 1000;

  if (seconds >= 10) {
    return `${Math.round(seconds)}s`;
  }

  const roundedTenths = Math.round(seconds * 10) / 10;
  if (Number.isInteger(roundedTenths)) {
    return `${roundedTenths.toFixed(0)}s`;
  }

  return `${roundedTenths.toFixed(1)}s`;
}

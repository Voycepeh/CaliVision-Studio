const DEFAULT_ASPECT_RATIO = 1;
const MIN_ASPECT_RATIO = 0.45;
const MAX_ASPECT_RATIO = 2.4;

function clampAspectRatio(value: number): number {
  return Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, value));
}

export function normalizeAspectRatio(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return clampAspectRatio(value);
}

export function resolveStableAspectRatio(
  previous: number | null | undefined,
  candidates: Array<number | null | undefined>,
  fallback = DEFAULT_ASPECT_RATIO
): number {
  for (const candidate of candidates) {
    const normalized = normalizeAspectRatio(candidate);
    if (normalized !== null) {
      return normalized;
    }
  }

  const previousNormalized = normalizeAspectRatio(previous);
  if (previousNormalized !== null) {
    return previousNormalized;
  }

  return clampAspectRatio(fallback);
}

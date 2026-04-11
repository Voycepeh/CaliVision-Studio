export type HardwareZoomSupport =
  | { supported: false }
  | {
      supported: true;
      min: number;
      max: number;
      step: number;
      current: number;
    };

export type ZoomTrackLike = {
  getCapabilities?: () => unknown;
  getSettings?: () => unknown;
  applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void>;
};

export const APP_HARDWARE_ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const ZOOM_EPSILON = 0.0001;

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function clampHardwareZoomValue(value: number, support: Extract<HardwareZoomSupport, { supported: true }>): number {
  const bounded = Math.min(support.max, Math.max(support.min, value));
  if (support.step <= 0) {
    return bounded;
  }
  const snapped = Math.round((bounded - support.min) / support.step) * support.step + support.min;
  return Math.min(support.max, Math.max(support.min, Number(snapped.toFixed(6))));
}

function isWithinZoomRange(value: number, min: number, max: number): boolean {
  return value + ZOOM_EPSILON >= min && value - ZOOM_EPSILON <= max;
}

export function getHardwareZoomSupport(track: ZoomTrackLike | null | undefined): HardwareZoomSupport {
  if (!track?.getCapabilities) {
    return { supported: false };
  }

  const capabilities = track.getCapabilities() as { zoom?: unknown };
  const zoomCapability = capabilities.zoom;
  const min = toFiniteNumber((zoomCapability as { min?: unknown } | undefined)?.min);
  const max = toFiniteNumber((zoomCapability as { max?: unknown } | undefined)?.max);
  const step = toFiniteNumber((zoomCapability as { step?: unknown } | undefined)?.step) ?? 0.1;
  if (min === null || max === null || max <= min) {
    return { supported: false };
  }

  const settings = track.getSettings ? (track.getSettings() as { zoom?: unknown }) : null;
  const rawCurrent = settings ? toFiniteNumber(settings.zoom) : null;
  const normalizedCurrent = rawCurrent === null ? min : Math.min(max, Math.max(min, rawCurrent));
  return {
    supported: true,
    min,
    max,
    step: step > 0 ? step : 0.1,
    current: normalizedCurrent
  };
}

export function getSupportedZoomPresets(
  support: HardwareZoomSupport,
  appPresets: readonly number[] = APP_HARDWARE_ZOOM_PRESETS
): number[] {
  if (!support.supported) {
    return [];
  }

  return appPresets
    .filter((preset) => Number.isFinite(preset) && isWithinZoomRange(preset, support.min, support.max))
    .map((preset) => clampHardwareZoomValue(preset, support));
}

export function resolveSelectedZoomPreset(currentZoom: number, availablePresets: readonly number[]): number | null {
  for (const preset of availablePresets) {
    if (Math.abs(currentZoom - preset) <= ZOOM_EPSILON) {
      return preset;
    }
  }
  return null;
}

export async function applyHardwareZoom(
  track: ZoomTrackLike,
  nextValue: number,
  support: Extract<HardwareZoomSupport, { supported: true }>
): Promise<number> {
  if (!track.applyConstraints) {
    return support.current;
  }

  const clamped = clampHardwareZoomValue(nextValue, support);
  await track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] });
  const settingsZoom = track.getSettings ? toFiniteNumber((track.getSettings() as { zoom?: unknown }).zoom) : null;
  return settingsZoom === null ? clamped : clampHardwareZoomValue(settingsZoom, support);
}

export async function applyHardwareZoomPreset(
  track: ZoomTrackLike,
  presetValue: number,
  support: Extract<HardwareZoomSupport, { supported: true }>
): Promise<number> {
  return applyHardwareZoom(track, presetValue, support);
}

export function formatHardwareZoomLabel(zoom: number): string {
  return `${Number(zoom.toFixed(2)).toString()}x`;
}

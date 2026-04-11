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
const ZOOM_DIAGNOSTIC_EPSILON = 0.005;

export type ZoomDiagnostics = {
  supportedConstraintsZoom: boolean;
  capabilityZoom: { min: number; max: number; step: number } | null;
  settingsZoom: number | null;
  derived: { min: number; max: number; step: number; current: number } | null;
  supportedPresets: number[];
  zeroPointFiveExcludedReason:
    | "included"
    | "zoom_unsupported"
    | "ptz_constraint_not_supported"
    | "capabilities_missing"
    | "min_zoom_above_half"
    | "snapped_above_half";
  rearCameraCount: number | null;
};

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

export function getZoomDiagnostics(
  support: HardwareZoomSupport,
  options: {
    supportedConstraintsZoom: boolean;
    capabilityZoom: { min: number; max: number; step: number } | null;
    settingsZoom: number | null;
    rearCameraCount?: number | null;
  }
): ZoomDiagnostics {
  const supportedPresets = getSupportedZoomPresets(support, APP_HARDWARE_ZOOM_PRESETS);
  const includesHalf = supportedPresets.some((preset) => Math.abs(preset - 0.5) <= ZOOM_DIAGNOSTIC_EPSILON);
  let zeroPointFiveExcludedReason: ZoomDiagnostics["zeroPointFiveExcludedReason"] = "included";

  if (!includesHalf) {
    if (!support.supported) {
      if (!options.supportedConstraintsZoom) {
        zeroPointFiveExcludedReason = "ptz_constraint_not_supported";
      } else if (!options.capabilityZoom) {
        zeroPointFiveExcludedReason = "capabilities_missing";
      } else {
        zeroPointFiveExcludedReason = "zoom_unsupported";
      }
    } else if (support.min - ZOOM_DIAGNOSTIC_EPSILON > 0.5) {
      zeroPointFiveExcludedReason = "min_zoom_above_half";
    } else {
      zeroPointFiveExcludedReason = "snapped_above_half";
    }
  }

  return {
    supportedConstraintsZoom: options.supportedConstraintsZoom,
    capabilityZoom: options.capabilityZoom,
    settingsZoom: options.settingsZoom,
    derived: support.supported ? { min: support.min, max: support.max, step: support.step, current: support.current } : null,
    supportedPresets,
    zeroPointFiveExcludedReason,
    rearCameraCount: options.rearCameraCount ?? null
  };
}

export function getSupportedZoomPresets(
  support: HardwareZoomSupport,
  appPresets: readonly number[] = APP_HARDWARE_ZOOM_PRESETS
): number[] {
  if (!support.supported) {
    return [];
  }

  const supportedPresets: number[] = [];
  for (const preset of appPresets) {
    if (!Number.isFinite(preset) || !isWithinZoomRange(preset, support.min, support.max)) {
      continue;
    }
    const snappedPreset = clampHardwareZoomValue(preset, support);
    if (!supportedPresets.some((value) => Math.abs(value - snappedPreset) <= ZOOM_EPSILON)) {
      supportedPresets.push(snappedPreset);
    }
  }
  return supportedPresets;
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

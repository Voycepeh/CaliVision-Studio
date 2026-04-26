import type { CoachingVisualGuide } from "./coaching-feedback.ts";

export type CoachingMovementFamily =
  | "handstand"
  | "push_up"
  | "dip"
  | "squat"
  | "plank"
  | "pike_push_up"
  | "custom";

export type CoachingRulesetId =
  | "handstand_wall_hold_v1"
  | "generic_hold_v1"
  | "generic_rep_v1"
  | "none"
  | "custom";

export type CoachingSupportType =
  | "free"
  | "wall_assisted"
  | "floor"
  | "bars"
  | "custom";

export type CoachingPrimaryGoal =
  | "balance"
  | "strength"
  | "mobility"
  | "control"
  | "custom";

export type CoachingVisualGuideType =
  | "stack_line"
  | "ghost_pose"
  | "highlight_region"
  | "correction_arrow"
  | "support_indicator"
  | "metric_badge";

export type DrillCoachingProfile = {
  movementFamily?: CoachingMovementFamily;
  rulesetId?: CoachingRulesetId;
  supportType?: CoachingSupportType;
  primaryGoal?: CoachingPrimaryGoal;
  enabledVisualGuides?: CoachingVisualGuideType[];
  cuePreference?: "visual_only" | "audio_optional" | "visual_and_audio";
};

export const HANDSTAND_DEFAULT_VISUAL_GUIDES: CoachingVisualGuideType[] = [
  "stack_line",
  "highlight_region",
  "correction_arrow",
  "support_indicator"
];

export function isCoachingProfileConfigured(profile: DrillCoachingProfile | undefined): boolean {
  if (!profile) return false;
  return Boolean(
    profile.movementFamily
    || profile.rulesetId
    || profile.supportType
    || profile.primaryGoal
    || profile.cuePreference
    || (profile.enabledVisualGuides?.length ?? 0) > 0
  );
}

export function applyCoachingProfileSuggestions(input: {
  current: DrillCoachingProfile | undefined;
  partial: Partial<DrillCoachingProfile>;
  drillType: "hold" | "rep";
}): DrillCoachingProfile {
  const merged: DrillCoachingProfile = { ...(input.current ?? {}), ...input.partial };
  const isSelectingHandstand = input.partial.movementFamily === "handstand";

  if (isSelectingHandstand) {
    merged.rulesetId ??= "handstand_wall_hold_v1";
    merged.supportType ??= "wall_assisted";
    merged.primaryGoal ??= "balance";
    merged.enabledVisualGuides ??= [...HANDSTAND_DEFAULT_VISUAL_GUIDES];
    merged.cuePreference ??= "audio_optional";
    return merged;
  }

  if (!merged.rulesetId || merged.rulesetId === "none") {
    merged.rulesetId = input.drillType === "hold" ? "generic_hold_v1" : "generic_rep_v1";
  }

  return merged;
}

export function deriveAutoCoachingProfile(input: {
  profile: DrillCoachingProfile | undefined;
  drillType: "hold" | "rep";
}): DrillCoachingProfile {
  if (input.profile) {
    return { ...input.profile };
  }

  return {
    rulesetId: input.drillType === "hold" ? "generic_hold_v1" : "generic_rep_v1",
    cuePreference: "visual_only"
  };
}

export function filterVisualGuidesByProfile(
  profile: DrillCoachingProfile | undefined,
  guides: CoachingVisualGuide[]
): CoachingVisualGuide[] {
  const enabledGuides = profile?.enabledVisualGuides;
  if (!enabledGuides?.length) {
    return guides;
  }

  const enabled = new Set(enabledGuides);
  return guides.filter((guide) => enabled.has(guide.type));
}

import {
  HANDSTAND_DEFAULT_VISUAL_GUIDES,
  type CoachingMovementFamily,
  type CoachingPrimaryGoal,
  type CoachingRulesetId,
  type CoachingSupportType,
  type CoachingVisualGuideType,
  type DrillCoachingProfile
} from "../../lib/analysis/coaching-profile.ts";

export type CoachingProfileFormState = {
  movementFamily: CoachingMovementFamily | "";
  rulesetId: CoachingRulesetId;
  supportType: CoachingSupportType | "";
  primaryGoal: CoachingPrimaryGoal | "";
  cuePreference: NonNullable<DrillCoachingProfile["cuePreference"]>;
  enabledVisualGuides: CoachingVisualGuideType[];
};

export function deriveCoachingProfileFormState(profile: DrillCoachingProfile | undefined): CoachingProfileFormState {
  return {
    movementFamily: profile?.movementFamily ?? "",
    rulesetId: profile?.rulesetId ?? "none",
    supportType: profile?.supportType ?? "",
    primaryGoal: profile?.primaryGoal ?? "",
    cuePreference: profile?.cuePreference ?? "visual_only",
    enabledVisualGuides: profile?.enabledVisualGuides
      ?? (profile?.rulesetId === "handstand_wall_hold_v1" ? HANDSTAND_DEFAULT_VISUAL_GUIDES : [])
  };
}

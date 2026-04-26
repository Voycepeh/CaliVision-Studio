"use client";

import type { CSSProperties } from "react";
import { getPrimaryDrill } from "@/lib/editor/package-editor";
import {
  deriveAutoCoachingProfile,
  isCoachingProfileConfigured,
  type CoachingMovementFamily,
  type CoachingPrimaryGoal,
  type CoachingRulesetId,
  type CoachingSupportType,
  type CoachingVisualGuideType
} from "@/lib/analysis/coaching-profile";
import { useStudioState } from "@/components/studio/StudioState";
import { deriveCoachingProfileFormState } from "@/components/studio/coaching-profile-form-state";

const VISUAL_GUIDE_OPTIONS: CoachingVisualGuideType[] = [
  "stack_line",
  "ghost_pose",
  "highlight_region",
  "correction_arrow",
  "support_indicator",
  "metric_badge"
];

export function StudioMetadataEditor() {
  const {
    selectedPackage,
    setDrillTitle,
    setDrillDescription,
    setDrillType,
    setDrillDifficulty,
    setDrillDefaultView,
    setDrillCoachingProfile,
    clearDrillCoachingProfile
  } = useStudioState();

  if (!selectedPackage) {
    return (
      <section>
        <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Drill info</h3>
        <p className="muted" style={{ margin: 0 }}>
          Load or import a drill file to edit metadata.
        </p>
      </section>
    );
  }

  const drill = getPrimaryDrill(selectedPackage.workingPackage);
  if (!drill) {
    return null;
  }
  const draftSetup = (drill as typeof drill & { draftSetup?: { movementTypeConfigured?: boolean; cameraViewConfigured?: boolean } }).draftSetup;
  const movementValue = draftSetup?.movementTypeConfigured ? drill.drillType : "";
  const cameraValue = draftSetup?.cameraViewConfigured ? drill.primaryView : "";
  const profile = drill.coachingProfile;
  const effectiveProfile = deriveAutoCoachingProfile({
    profile,
    drillType: drill.drillType
  });
  const profileFormState = deriveCoachingProfileFormState(effectiveProfile);
  const hasProfile = isCoachingProfileConfigured(profile);
  const setOverrideProfile = (partial: Partial<NonNullable<typeof profile>>) => {
    setDrillCoachingProfile({ ...effectiveProfile, ...partial });
  };

  return (
    <section style={{ display: "grid", gap: "0.55rem" }}>
      <div className="field-grid">
        <label style={labelStyle}>
          <span>Drill title</span>
          <input value={drill.title} onChange={(event) => setDrillTitle(event.target.value)} style={inputStyle} placeholder="Add drill title" />
        </label>
      </div>

      <label style={labelStyle}>
        <span>Movement type</span>
        <select
          value={movementValue}
          onChange={(event) => {
            if (!event.target.value) return;
            setDrillType(event.target.value as typeof drill.drillType);
          }}
          style={inputStyle}
        >
          <option value="">Choose movement type</option>
          <option value="hold">hold</option>
          <option value="rep">rep</option>
        </select>
      </label>

      <label style={labelStyle}>
        <span>Description</span>
        <textarea
          value={drill.description ?? ""}
          onChange={(event) => setDrillDescription(event.target.value)}
          style={{ ...inputStyle, minHeight: "74px", resize: "vertical" }}
        />
      </label>

      <div className="field-grid">
        <label style={labelStyle}>
          <span>Difficulty</span>
          <select value={drill.difficulty} onChange={(event) => setDrillDifficulty(event.target.value as typeof drill.difficulty)} style={inputStyle}>
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span>Camera view</span>
          <select
            value={cameraValue}
            onChange={(event) => {
              if (!event.target.value) return;
              setDrillDefaultView(event.target.value as typeof drill.primaryView);
            }}
            style={inputStyle}
          >
            <option value="">Choose camera view</option>
            <option value="front">front</option>
            <option value="side">side</option>
            <option value="rear">rear</option>
          </select>
        </label>
      </div>

      <section style={coachingSectionStyle}>
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Advanced coaching settings</h4>
          <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            CaliVision can auto-select coaching cues from this drill’s movement type, camera view, and phases.
          </p>
          <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--muted)" }}>
            {hasProfile ? "Override saved for this drill" : "Auto-selected from drill details"}
            {effectiveProfile.rulesetId ? ` · Ruleset: ${formatRulesetLabel(effectiveProfile.rulesetId)}` : ""}
          </p>
        </div>

        <details>
          <summary style={detailsSummaryStyle}>Auto-selected from drill details</summary>
          <div style={detailsBodyStyle}>
            <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
              Override coaching settings
            </p>

            <div className="field-grid">
              <label style={labelStyle}>
              <span>Movement family</span>
              <select
              value={profileFormState.movementFamily}
              onChange={(event) => setOverrideProfile({ movementFamily: toOptionalValue<CoachingMovementFamily>(event.target.value) })}
              style={inputStyle}
            >
              <option value="">Not configured</option>
              <option value="handstand">Handstand</option>
              <option value="push_up">Push-up</option>
              <option value="dip">Dip</option>
              <option value="squat">Squat</option>
              <option value="plank">Plank</option>
              <option value="pike_push_up">Pike push-up</option>
              <option value="custom">Custom</option>
            </select>
              </label>

              <label style={labelStyle}>
                <span>Primary coaching goal</span>
                <select
                  value={profileFormState.primaryGoal}
                  onChange={(event) => setOverrideProfile({ primaryGoal: toOptionalValue<CoachingPrimaryGoal>(event.target.value) })}
                  style={inputStyle}
                >
                  <option value="">Not configured</option>
                  <option value="balance">Balance</option>
                  <option value="strength">Strength</option>
                  <option value="mobility">Mobility</option>
                  <option value="control">Control</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              <label style={labelStyle}>
                <span>Coaching ruleset</span>
                <select
                  value={profileFormState.rulesetId}
                  onChange={(event) => setOverrideProfile({ rulesetId: event.target.value as CoachingRulesetId })}
                  style={inputStyle}
                >
                  <option value="none">None</option>
                  <option value="handstand_wall_hold_v1">Handstand wall hold</option>
                  <option value="generic_hold_v1">Generic hold</option>
                  <option value="generic_rep_v1">Generic rep</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              <label style={labelStyle}>
                <span>Support type</span>
                <select
                  value={profileFormState.supportType}
                  onChange={(event) => setOverrideProfile({ supportType: toOptionalValue<CoachingSupportType>(event.target.value) })}
                  style={inputStyle}
                >
                  <option value="">Not configured</option>
                  <option value="free">Free</option>
                  <option value="wall_assisted">Wall assisted</option>
                  <option value="floor">Floor</option>
                  <option value="bars">Bars</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              <label style={labelStyle}>
                <span>Cue preference</span>
                <select
                  value={profileFormState.cuePreference}
                  onChange={(event) => setOverrideProfile({ cuePreference: event.target.value as NonNullable<typeof profile>["cuePreference"] })}
                  style={inputStyle}
                >
                  <option value="visual_only">Visual only</option>
                  <option value="audio_optional">Audio optional</option>
                  <option value="visual_and_audio">Visual + audio</option>
                </select>
              </label>
            </div>

            <fieldset style={fieldsetStyle}>
              <legend style={{ padding: "0 0.2rem" }}>Visual guides</legend>
              <div style={guideListStyle}>
                {VISUAL_GUIDE_OPTIONS.map((guideType) => {
                  const selectedGuides = profileFormState.enabledVisualGuides;
                  const checked = selectedGuides.includes(guideType);
                  return (
                    <label key={guideType} style={checkboxLabelStyle}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const next = new Set(selectedGuides);
                          if (event.target.checked) {
                            next.add(guideType);
                          } else {
                            next.delete(guideType);
                          }
                          setOverrideProfile({ enabledVisualGuides: [...next] });
                        }}
                      />
                      <span>{formatVisualGuideLabel(guideType)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </details>

        <button
          type="button"
          onClick={() => {
            if (!window.confirm("Clear this drill’s coaching profile?")) return;
            clearDrillCoachingProfile();
          }}
          style={secondaryButtonStyle}
        >
          Clear coaching profile
        </button>
      </section>
    </section>
  );
}

function toOptionalValue<T extends string>(value: string): T | undefined {
  return value ? (value as T) : undefined;
}

function formatVisualGuideLabel(guideType: CoachingVisualGuideType): string {
  if (guideType === "stack_line") return "Stack line";
  if (guideType === "ghost_pose") return "Ghost pose";
  if (guideType === "highlight_region") return "Highlight region";
  if (guideType === "correction_arrow") return "Correction arrow";
  if (guideType === "support_indicator") return "Support indicator";
  return "Metric badge";
}

function formatRulesetLabel(rulesetId: CoachingRulesetId): string {
  if (rulesetId === "handstand_wall_hold_v1") return "Handstand wall hold";
  if (rulesetId === "generic_hold_v1") return "Generic hold";
  if (rulesetId === "generic_rep_v1") return "Generic rep";
  if (rulesetId === "none") return "None";
  return "Custom";
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  color: "var(--muted)",
  fontSize: "0.85rem"
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.45rem"
};

const coachingSectionStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
  border: "1px solid var(--border)",
  borderRadius: "0.6rem",
  padding: "0.6rem",
  background: "var(--panel-soft)"
};

const fieldsetStyle: CSSProperties = {
  margin: 0,
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  padding: "0.45rem"
};

const guideGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.3rem"
};

const detailsSummaryStyle: CSSProperties = {
  cursor: "pointer",
  fontSize: "0.82rem",
  color: "var(--muted)"
};

const detailsBodyStyle: CSSProperties = {
  marginTop: "0.45rem",
  display: "grid",
  gap: "0.5rem"
};

const checkboxLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  fontSize: "0.8rem",
  color: "var(--muted)"
};

const guideListStyle = guideGridStyle;

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.45rem",
  background: "transparent",
  color: "var(--muted)",
  fontSize: "0.78rem",
  padding: "0.35rem 0.5rem",
  justifySelf: "start"
};

"use client";

import type { CSSProperties } from "react";
import { getPrimaryDrill } from "@/lib/editor/package-editor";
import {
  HANDSTAND_DEFAULT_VISUAL_GUIDES,
  isCoachingProfileConfigured,
  type CoachingMovementFamily,
  type CoachingPrimaryGoal,
  type CoachingRulesetId,
  type CoachingSupportType,
  type CoachingVisualGuideType
} from "@/lib/analysis/coaching-profile";
import { useStudioState } from "@/components/studio/StudioState";

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
  const hasProfile = isCoachingProfileConfigured(profile);

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
          <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Coaching Profile</h4>
          <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            Coaching Profile tells CaliVision which coaching rules and visual guides to use for this drill. This prevents rule selection from relying on drill title.
          </p>
          <p style={{ margin: 0, fontSize: "0.76rem", color: "var(--muted)" }}>
            {hasProfile ? "Coaching profile configured" : "Coaching profile not configured — fallback rules may be used"}
            {profile?.rulesetId ? ` · Ruleset: ${formatRulesetLabel(profile.rulesetId)}` : ""}
          </p>
        </div>

        <div className="field-grid">
          <label style={labelStyle}>
            <span>Movement family</span>
            <select
              value={profile?.movementFamily ?? ""}
              onChange={(event) => setDrillCoachingProfile({ movementFamily: toOptionalValue<CoachingMovementFamily>(event.target.value) })}
              style={inputStyle}
            >
              <option value="">Not configured</option>
              <option value="handstand">handstand</option>
              <option value="push_up">push_up</option>
              <option value="dip">dip</option>
              <option value="squat">squat</option>
              <option value="plank">plank</option>
              <option value="pike_push_up">pike_push_up</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label style={labelStyle}>
            <span>Coaching ruleset</span>
            <select
              value={profile?.rulesetId ?? "none"}
              onChange={(event) => setDrillCoachingProfile({ rulesetId: event.target.value as CoachingRulesetId })}
              style={inputStyle}
            >
              <option value="none">none</option>
              <option value="handstand_wall_hold_v1">handstand_wall_hold_v1</option>
              <option value="generic_hold_v1">generic_hold_v1</option>
              <option value="generic_rep_v1">generic_rep_v1</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label style={labelStyle}>
            <span>Support type</span>
            <select
              value={profile?.supportType ?? ""}
              onChange={(event) => setDrillCoachingProfile({ supportType: toOptionalValue<CoachingSupportType>(event.target.value) })}
              style={inputStyle}
            >
              <option value="">Not configured</option>
              <option value="free">free</option>
              <option value="wall_assisted">wall_assisted</option>
              <option value="floor">floor</option>
              <option value="bars">bars</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label style={labelStyle}>
            <span>Primary coaching goal</span>
            <select
              value={profile?.primaryGoal ?? ""}
              onChange={(event) => setDrillCoachingProfile({ primaryGoal: toOptionalValue<CoachingPrimaryGoal>(event.target.value) })}
              style={inputStyle}
            >
              <option value="">Not configured</option>
              <option value="balance">balance</option>
              <option value="strength">strength</option>
              <option value="mobility">mobility</option>
              <option value="control">control</option>
              <option value="custom">custom</option>
            </select>
          </label>

          <label style={labelStyle}>
            <span>Cue preference</span>
            <select
              value={profile?.cuePreference ?? "visual_only"}
              onChange={(event) => setDrillCoachingProfile({ cuePreference: event.target.value as NonNullable<typeof profile>["cuePreference"] })}
              style={inputStyle}
            >
              <option value="visual_only">visual_only</option>
              <option value="audio_optional">audio_optional</option>
              <option value="visual_and_audio">visual_and_audio</option>
            </select>
          </label>
        </div>

        <fieldset style={fieldsetStyle}>
          <legend style={{ padding: "0 0.2rem" }}>Visual guides</legend>
          <div style={guideGridStyle}>
            {VISUAL_GUIDE_OPTIONS.map((guideType) => {
              const selectedGuides = profile?.enabledVisualGuides
                ?? (profile?.rulesetId === "handstand_wall_hold_v1" ? HANDSTAND_DEFAULT_VISUAL_GUIDES : []);
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
                      setDrillCoachingProfile({ enabledVisualGuides: [...next] });
                    }}
                  />
                  <span>{guideType}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <button type="button" onClick={clearDrillCoachingProfile} style={secondaryButtonStyle}>Clear coaching profile</button>
      </section>
    </section>
  );
}

function toOptionalValue<T extends string>(value: string): T | undefined {
  return value ? (value as T) : undefined;
}

function formatRulesetLabel(rulesetId: CoachingRulesetId): string {
  if (rulesetId === "handstand_wall_hold_v1") return "Handstand wall hold v1";
  if (rulesetId === "generic_hold_v1") return "Generic hold v1";
  if (rulesetId === "generic_rep_v1") return "Generic rep v1";
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
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.35rem"
};

const checkboxLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.8rem",
  color: "var(--muted)"
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.45rem",
  background: "transparent",
  color: "var(--muted)",
  fontSize: "0.78rem",
  padding: "0.35rem 0.5rem",
  justifySelf: "start"
};

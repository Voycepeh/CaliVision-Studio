import type { ReactNode } from "react";

type DrillSetupHeaderProps = {
  title: string;
  description: string;
  showReferencePanel: boolean;
  onToggleReferencePanel: () => void;
  actions?: ReactNode;
};

export function DrillSetupHeader({ title, description, showReferencePanel, onToggleReferencePanel, actions }: DrillSetupHeaderProps) {
  return (
    <div className="drill-setup-shell-card">
      <div style={{ display: "grid", gap: "0.65rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.55rem", alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "0.95rem" }}>{title}</strong>
          {actions}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.55rem", alignItems: "center", flexWrap: "wrap" }}>
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>{description}</p>
          <button type="button" className="pill" onClick={onToggleReferencePanel} aria-expanded={showReferencePanel}>
            {showReferencePanel ? "Hide reference animation" : "Show reference animation"}
          </button>
        </div>
      </div>
    </div>
  );
}

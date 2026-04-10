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
    <div className="drill-setup-shell-card drill-setup-header-card">
      <div className="drill-setup-header-row">
        <div className="drill-setup-header-copy">
          <strong className="drill-setup-header-title">{title}</strong>
          <p className="muted drill-setup-header-description">{description}</p>
        </div>
        <div className="drill-setup-header-actions">
          {actions}
          <button type="button" className="pill" onClick={onToggleReferencePanel} aria-expanded={showReferencePanel}>
            {showReferencePanel ? "Hide reference animation" : "Show reference animation"}
          </button>
        </div>
      </div>
    </div>
  );
}

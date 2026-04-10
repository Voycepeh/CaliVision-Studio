import type { ReactNode } from "react";

type DrillSetupShellProps = {
  setupKey?: string | number;
  showReferencePanel: boolean;
  leftPane: ReactNode;
  rightPane?: ReactNode;
};

export function DrillSetupShell({ setupKey, showReferencePanel, leftPane, rightPane }: DrillSetupShellProps) {
  return (
    <div key={setupKey} className={`drill-setup-layout${showReferencePanel ? "" : " drill-setup-layout--collapsed"}`}>
      <div className="drill-setup-primary">{leftPane}</div>
      {showReferencePanel ? <aside className="drill-setup-reference">{rightPane}</aside> : null}
    </div>
  );
}

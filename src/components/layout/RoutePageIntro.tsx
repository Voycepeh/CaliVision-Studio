import type { ReactNode } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";

type RoutePageIntroProps = {
  title: string;
  description: string;
  children: ReactNode;
  eyebrow?: string;
  statusLabel?: string;
  navActive?: "home" | "library" | "studio" | "upload" | "live" | "exchange" | "admin";
};

export function RoutePageIntro({ title, description, children, eyebrow, statusLabel, navActive }: RoutePageIntroProps) {
  return (
    <>
      <PrimaryNav active={navActive} />
      <main className="page-shell">
        <section className="surface-header">
          <div className="surface-header-meta">
            {eyebrow ? <p className="surface-eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
            <p className="muted">{description}</p>
          </div>
          {statusLabel ? <span className="surface-status-chip">{statusLabel}</span> : null}
        </section>
        {children}
      </main>
    </>
  );
}

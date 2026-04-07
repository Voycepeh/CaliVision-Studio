import Link from "next/link";
import type { ReactNode } from "react";

type RoutePageIntroProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function RoutePageIntro({ title, description, children }: RoutePageIntroProps) {
  return (
    <main className="page-shell">
      <h1>{title}</h1>
      <p className="muted">{description}</p>
      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
        <Link href="/library" className="pill">
          Back to Library
        </Link>
        <Link href="/studio" className="pill">
          Open Drill Studio
        </Link>
      </div>
      {children}
    </main>
  );
}

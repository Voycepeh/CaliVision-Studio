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
      <Link href="/studio" style={{ color: "var(--accent)" }}>
        Open Studio workspace
      </Link>
      {children}
    </main>
  );
}

import type { ReactNode } from "react";
import { PrimaryNav } from "@/components/layout/PrimaryNav";

type RoutePageIntroProps = {
  title: string;
  description: string;
  children: ReactNode;
  navActive?: "home" | "library" | "upload" | "exchange" | "packages";
};

export function RoutePageIntro({ title, description, children, navActive }: RoutePageIntroProps) {
  return (
    <>
      <PrimaryNav active={navActive} />
      <main className="page-shell">
        <h1>{title}</h1>
        <p className="muted">{description}</p>
        {children}
      </main>
    </>
  );
}

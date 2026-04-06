"use client";

import type { PropsWithChildren } from "react";

type StudioInspectorAccordionProps = PropsWithChildren<{
  title: string;
  defaultOpen?: boolean;
}>;

export function StudioInspectorAccordion({ title, defaultOpen = false, children }: StudioInspectorAccordionProps) {
  return (
    <details className="studio-accordion card" open={defaultOpen}>
      <summary className="studio-accordion-summary">
        <span>{title}</span>
      </summary>
      <div className="studio-accordion-body">{children}</div>
    </details>
  );
}

"use client";

import { useMemo, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";

type StudioResizableLayoutProps = {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
};

type MobileTab = "library" | "workspace" | "details";

const LEFT_MIN = 220;
const LEFT_MAX = 420;
const RIGHT_MIN = 260;
const RIGHT_MAX = 520;

export function StudioResizableLayout({ left, center, right }: StudioResizableLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(360);
  const [mobileTab, setMobileTab] = useState<MobileTab>("workspace");

  const gridStyle = useMemo(
    () =>
      ({
        "--studio-left": `${leftWidth}px`,
        "--studio-right": `${rightWidth}px`
      }) as React.CSSProperties,
    [leftWidth, rightWidth]
  );

  function beginResize(panel: "left" | "right", event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel === "left" ? leftWidth : rightWidth;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;

      if (panel === "left") {
        const next = Math.min(LEFT_MAX, Math.max(LEFT_MIN, startWidth + delta));
        setLeftWidth(next);
        return;
      }

      const next = Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, startWidth - delta));
      setRightWidth(next);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <main>
      <TopBar />
      <section className="studio-shell studio-shell-resizable">
        <nav className="studio-mobile-tabs" aria-label="Studio sections">
          <button type="button" className={mobileTab === "library" ? "active" : ""} onClick={() => setMobileTab("library")}>
            Library
          </button>
          <button type="button" className={mobileTab === "workspace" ? "active" : ""} onClick={() => setMobileTab("workspace")}>
            Drill Editor
          </button>
          <button type="button" className={mobileTab === "details" ? "active" : ""} onClick={() => setMobileTab("details")}>
            Details
          </button>
        </nav>

        <div className="studio-resizable-grid" style={gridStyle}>
          <aside className={`panel studio-pane-left ${mobileTab === "library" ? "mobile-visible" : ""}`}>{left}</aside>
          <button type="button" className="studio-resize-handle studio-resize-handle-left" onPointerDown={(event) => beginResize("left", event)}>
            Resize left panel
          </button>
          <section className={`panel studio-pane-center ${mobileTab === "workspace" ? "mobile-visible" : ""}`}>{center}</section>
          <button type="button" className="studio-resize-handle studio-resize-handle-right" onPointerDown={(event) => beginResize("right", event)}>
            Resize right panel
          </button>
          <aside className={`panel studio-pane-right ${mobileTab === "details" ? "mobile-visible" : ""}`}>{right}</aside>
        </div>
      </section>
    </main>
  );
}

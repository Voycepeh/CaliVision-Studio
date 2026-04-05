"use client";

import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";

type StudioResizableLayoutProps = {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
};

type ActivePanel = "left" | "center" | "right";

const LEFT_MIN = 230;
const LEFT_MAX = 420;
const RIGHT_MIN = 280;
const RIGHT_MAX = 460;
const MOBILE_BREAKPOINT = 1180;

export function StudioResizableLayout({ left, center, right }: StudioResizableLayoutProps) {
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(360);
  const [activePanel, setActivePanel] = useState<ActivePanel>("center");
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const updateLayoutMode = () => {
      setIsCompact(window.innerWidth < MOBILE_BREAKPOINT);
    };

    updateLayoutMode();
    window.addEventListener("resize", updateLayoutMode);
    return () => window.removeEventListener("resize", updateLayoutMode);
  }, []);

  function startResize(side: "left" | "right", startX: number) {
    const startLeft = leftWidth;
    const startRight = rightWidth;

    const onMove = (event: PointerEvent) => {
      const delta = event.clientX - startX;
      if (side === "left") {
        setLeftWidth(Math.min(LEFT_MAX, Math.max(LEFT_MIN, startLeft + delta)));
        return;
      }

      setRightWidth(Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, startRight - delta)));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const desktopStyle = useMemo(
    () => ({
      gridTemplateColumns: `${leftWidth}px 8px minmax(520px, 1fr) 8px ${rightWidth}px`
    }),
    [leftWidth, rightWidth]
  );

  return (
    <main>
      <TopBar />
      <section className="studio-shell">
        {isCompact ? (
          <div className="studio-mobile-layout">
            <div className="studio-mobile-tabs">
              <button type="button" className={activePanel === "left" ? "is-active" : ""} onClick={() => setActivePanel("left")}>Library</button>
              <button type="button" className={activePanel === "center" ? "is-active" : ""} onClick={() => setActivePanel("center")}>Inspector</button>
              <button type="button" className={activePanel === "right" ? "is-active" : ""} onClick={() => setActivePanel("right")}>Drill details</button>
            </div>
            <div className="panel">{activePanel === "left" ? left : activePanel === "center" ? center : right}</div>
          </div>
        ) : (
          <div className="studio-resizable-grid" style={desktopStyle}>
            <aside className="panel">{left}</aside>
            <div className="panel-resizer" onPointerDown={(event) => startResize("left", event.clientX)} role="separator" aria-label="Resize library panel" />
            <section className="panel">{center}</section>
            <div className="panel-resizer" onPointerDown={(event) => startResize("right", event.clientX)} role="separator" aria-label="Resize details panel" />
            <aside className="panel">{right}</aside>
          </div>
        )}
      </section>
    </main>
  );
}

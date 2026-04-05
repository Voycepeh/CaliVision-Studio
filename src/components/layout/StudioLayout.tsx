import { TopBar } from "@/components/layout/TopBar";

type StudioLayoutProps = {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
};

export function StudioLayout({ left, center, right }: StudioLayoutProps) {
  return (
    <main>
      <TopBar />
      <section className="studio-grid">
        {[left, center, right].map((panel, idx) => (
          <div
            key={idx}
            style={{
              border: "1px solid var(--border)",
              background: "var(--panel)",
              borderRadius: "0.8rem",
              overflow: "hidden",
              minHeight: 0
            }}
          >
            {panel}
          </div>
        ))}
      </section>
    </main>
  );
}

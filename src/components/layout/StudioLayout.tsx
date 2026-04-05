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
      <section className="studio-shell">
        <div className="studio-grid">
          <aside className="panel">{left}</aside>
          <section className="panel">{center}</section>
          <aside className="panel">{right}</aside>
        </div>
      </section>
    </main>
  );
}

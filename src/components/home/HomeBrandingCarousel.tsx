import type { HomepageBrandingImage } from "@/lib/media/types";

type HomeBrandingCarouselProps = {
  items: HomepageBrandingImage[];
};

export function HomeBrandingCarousel({ items }: HomeBrandingCarouselProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="home-branding" aria-label="Homepage branding carousel">
      <header className="home-branding-header">
        <h2>Drill Studio highlights</h2>
        <p>Latest branding visuals are managed in admin and delivered from hosted media storage.</p>
      </header>
      <div className="home-branding-track" role="list">
        {items.map((item, index) => {
          const aspectRatio = item.width && item.height ? `${item.width} / ${item.height}` : "16 / 9";
          return (
            <figure key={item.id} className="home-branding-item" role="listitem" style={{ aspectRatio }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src}
                alt={item.alt}
                width={item.width ?? 1600}
                height={item.height ?? 900}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
              />
              {item.title ? <figcaption>{item.title}</figcaption> : null}
            </figure>
          );
        })}
      </div>
    </section>
  );
}

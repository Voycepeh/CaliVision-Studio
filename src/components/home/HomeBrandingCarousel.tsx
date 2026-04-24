"use client";

import { useEffect, useMemo, useState } from "react";
import type { HomepageBrandingImage } from "@/lib/media/types";

type HomeBrandingCarouselProps = {
  items: HomepageBrandingImage[];
  autoAdvanceMs: number;
};

export function HomeBrandingCarousel({ items, autoAdvanceMs }: HomeBrandingCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const total = items.length;
  const activeItem = items[activeIndex] ?? items[0];
  const activeAspectRatio = useMemo(() => {
    if (activeItem?.width && activeItem?.height) {
      return `${activeItem.width} / ${activeItem.height}`;
    }
    return "16 / 9";
  }, [activeItem?.height, activeItem?.width]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReducedMotion(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (total <= 1 || isPaused || prefersReducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % total);
    }, autoAdvanceMs);

    return () => window.clearInterval(timer);
  }, [autoAdvanceMs, isPaused, prefersReducedMotion, total]);

  if (total === 0) {
    return null;
  }

  function goTo(index: number): void {
    const normalized = ((index % total) + total) % total;
    setActiveIndex(normalized);
  }

  function onTouchEnd(touchEndX: number): void {
    if (touchStartX === null) return;
    const delta = touchEndX - touchStartX;
    if (Math.abs(delta) < 42) return;
    goTo(delta < 0 ? activeIndex + 1 : activeIndex - 1);
  }

  return (
    <section className="home-branding" aria-label="Homepage branding carousel">
      <div
        className="home-branding-stage"
        style={{ aspectRatio: activeAspectRatio }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
      >
        <button type="button" className="home-branding-nav home-branding-nav-prev" onClick={() => goTo(activeIndex - 1)} aria-label="Previous slide">
          ‹
        </button>

        <div
          className="home-branding-viewport"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") goTo(activeIndex - 1);
            if (event.key === "ArrowRight") goTo(activeIndex + 1);
          }}
          onTouchStart={(event) => {
            setIsPaused(true);
            setTouchStartX(event.touches[0]?.clientX ?? null);
          }}
          onTouchEnd={(event) => {
            onTouchEnd(event.changedTouches[0]?.clientX ?? 0);
            setIsPaused(false);
          }}
        >
          <div className="home-branding-track" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
            {items.map((item, index) => (
              <figure key={item.id} className={`home-branding-item ${index === activeIndex ? "is-active" : ""}`} aria-hidden={index !== activeIndex}>
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
            ))}
          </div>
        </div>

        <button type="button" className="home-branding-nav home-branding-nav-next" onClick={() => goTo(activeIndex + 1)} aria-label="Next slide">
          ›
        </button>
      </div>

      {total > 1 ? (
        <div className="home-branding-dots" role="tablist" aria-label="Branding slides">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`Go to slide ${index + 1}`}
              className={`home-branding-dot ${index === activeIndex ? "is-active" : ""}`}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

type HomeDemoMediaProps = {
  title: string;
  caption?: string;
  videoSrc?: string;
  posterSrc?: string;
  placeholderLabel?: string;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  steps?: string[];
};

export function HomeDemoMedia({
  title,
  caption,
  videoSrc,
  posterSrc,
  placeholderLabel = "Product demo coming soon",
  autoplay = true,
  muted = true,
  loop = true,
  steps = []
}: HomeDemoMediaProps) {
  const hasVideo = Boolean(videoSrc);

  return (
    <section className="home-demo" aria-label="Product demo">
      <div className="home-demo-frame">
        {hasVideo ? (
          <video
            className="home-demo-video"
            src={videoSrc}
            poster={posterSrc}
            controls
            playsInline
            autoPlay={autoplay}
            muted={muted}
            loop={loop}
            preload={posterSrc ? "metadata" : "none"}
          />
        ) : (
          <div className="home-demo-placeholder" role="img" aria-label={placeholderLabel}>
            <span className="pill home-demo-placeholder-pill">{placeholderLabel}</span>
          </div>
        )}
      </div>
      <div className="home-demo-caption">
        <strong>{title}</strong>
        {caption ? <p>{caption}</p> : null}
      </div>
      {steps.length > 0 ? (
        <div className="home-demo-steps" aria-label="Workflow steps">
          {steps.map((step, index) => (
            <span key={step} className="pill home-demo-step">{index + 1}. {step}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

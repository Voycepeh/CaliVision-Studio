import Image from "next/image";

type CaliVisionLogoProps = {
  size?: "hero" | "nav" | "compact";
  className?: string;
  priority?: boolean;
};

const sizeMap = {
  hero: { width: 520, height: 162 },
  nav: { width: 168, height: 52 },
  compact: { width: 116, height: 36 }
} as const;

export function CaliVisionLogo({ size = "hero", className, priority = false }: CaliVisionLogoProps) {
  const dimensions = sizeMap[size];

  return (
    <Image
      src="/brand/calivision-home-logo.png"
      alt="CaliVision"
      width={dimensions.width}
      height={dimensions.height}
      priority={priority}
      className={className}
    />
  );
}

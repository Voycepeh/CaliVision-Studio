import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/layout/AppProviders";

export const metadata: Metadata = {
  title: "CaliVision",
  description: "Brand-first web workspace for Drill Studio, Upload Video, and Drill Exchange workflows",
  icons: {
    icon: "/brand/calivision-favicon-optimized.png?v=2",
    shortcut: "/brand/calivision-favicon-optimized.png?v=2",
    apple: "/brand/calivision-favicon-optimized.png?v=2"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}

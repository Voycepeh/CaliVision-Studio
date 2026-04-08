import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/layout/AppProviders";

export const metadata: Metadata = {
  title: "CaliVision",
  description: "Brand-first web workspace for Drill Studio, Upload Video, and Drill Exchange workflows"
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

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaliVision Studio",
  description: "Library-first web home for Drill Studio, Upload Video, and Drill Exchange workflows"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

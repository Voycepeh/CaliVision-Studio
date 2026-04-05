import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaliVision Studio",
  description: "Web-first drill authoring and drill file publishing workspace"
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

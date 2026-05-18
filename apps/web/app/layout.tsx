import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "opendicewar",
  description: "Open-source reimplementation of Dicewars",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Lock user scaling so a double-tap on the board doesn't zoom; the board
  // itself is the interactive surface and we don't want browser zoom fighting
  // the canvas-relative hit testing.
  userScalable: false,
  themeColor: "#eeeeee",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

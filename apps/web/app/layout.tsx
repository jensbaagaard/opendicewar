import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "opendicewar",
  description: "Open-source reimplementation of Dicewars",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

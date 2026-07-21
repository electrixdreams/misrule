import type { Metadata, Viewport } from "next";
import { Cormorant, Spectral, Inter } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font: replaces the prior Baskerville/Iowan Old Style
// stack, which had no @font-face fallback and silently degraded to generic
// serif on any non-Apple judge machine. System-font names are kept as later
// fallbacks in globals.css, not removed.
const cormorant = Cormorant({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-spectral",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Misrule — Find where the world turns against itself.",
  description: "Inspectable fictional-world rule audit.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090d0e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${spectral.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Misrule — The Ashglass Clocktower",
  description: "Inspectable fictional-world rule audit.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090d0e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

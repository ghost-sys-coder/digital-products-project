import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VeilCode Studio", template: "%s | VeilCode Studio" },
  description: "Practical guides and editable templates for independent creatives. The VeilCode Studio collection.",
  robots: { index: true, follow: true },
  referrer: "no-referrer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

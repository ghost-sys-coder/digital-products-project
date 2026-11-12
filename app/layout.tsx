import type { Metadata } from "next";
import "./globals.css";
import { deploymentLabel } from "@/lib/env";

// Evaluated per deployment: Vercel builds each environment with its own variables.
const environment = deploymentLabel();
const production = environment === "production";

export const metadata: Metadata = {
  title: { default: "VeilCode Studio", template: "%s | VeilCode Studio" },
  description: "Practical guides and editable templates for independent creatives. The VeilCode Studio collection.",
  // Only production may be indexed; a preview must never compete with the real store.
  robots: production ? { index: true, follow: true } : { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>
    {!production && <div className="environment-banner" role="note">
      <strong>{environment === "development" ? "Development" : environment === "preview" ? "Preview" : "Unconfigured"} environment</strong>
      <span>Test payments only. Not the live store; orders and emails here are not real.</span>
    </div>}
    {children}
  </body></html>;
}

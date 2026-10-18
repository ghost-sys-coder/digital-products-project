import type { Metadata } from "next";

export const metadata: Metadata = { title: "Download link unavailable", robots: { index: false, follow: false } };

export default function DownloadError() {
  return (
    <main className="delivery-page">
      <p className="studio">VeilCode Studio</p>
      <h1>This link has expired or reached its download limit.</h1>
      <p>Email <a href="mailto:support@veilcode.studio">support@veilcode.studio</a> with your purchase email and we&apos;ll send a fresh one.</p>
    </main>
  );
}

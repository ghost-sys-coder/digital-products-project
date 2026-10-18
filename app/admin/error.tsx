"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  return <main className="delivery-page"><span className="eyebrow">STUDIO WORKSPACE</span><h1>We couldn&apos;t load your workspace.</h1><p>Please try again. If this is your first setup, confirm the storefront migration and environment variables are in place.</p><button className="button primary" onClick={reset}>Try again</button></main>;
}

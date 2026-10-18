"use client";
export default function StoreError({ reset }: { reset: () => void }) {
  return <main className="delivery-page"><span className="eyebrow">VEILCODE STUDIO</span><h1>A small pause.</h1><p>We couldn&apos;t load this page. Please try again in a moment.</p><button className="button primary" onClick={reset}>Try again</button></main>;
}

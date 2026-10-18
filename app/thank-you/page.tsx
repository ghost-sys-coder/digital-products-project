import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/store";
import { MAX_DOWNLOADS, TOKEN_LIFETIME_DAYS } from "@/lib/tokens";

export const metadata: Metadata = { title: "Payment received", robots: { index: false, follow: false } };

export default function ThankYou() {
  return (
    <div className="thank-you-page">
      <header className="thank-you-header">
        <Brand />
        <span>A little structure. More good work.</span>
      </header>
      <main className="thank-you-main">
        <section className="thank-you-hero" aria-labelledby="thank-you-title">
          <div className="thank-you-copy">
            <span className="thank-you-status"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8" stroke="currentColor" /><path d="m6 10 2.5 2.5L14 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>Payment received</span>
            <h1 id="thank-you-title">Thank you.<br />Here&apos;s to <em>good work.</em></h1>
            <p>Your next good idea has a starting point. We&apos;re glad to be a small part of it.</p>
            <p className="thank-you-delivery">Your download link is on its way to the email you used at checkout, usually within a minute.</p>
            <Link className="button primary" href="/">Back to the collection <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="thank-you-note" aria-hidden="true">
            <div className="thank-you-note-top"><span>A GOOD THING, DELIVERED.</span><span>VC / 01</span></div>
            <svg className="thank-you-envelope" width="320" height="250" viewBox="0 0 320 250" fill="none">
              <path d="m45 106 115-76 115 76v111H45V106Z" fill="#DCE5FF" stroke="#829AE0" />
              <g className="thank-you-letter">
                <rect x="79" y="43" width="162" height="143" rx="5" fill="white" stroke="#BCCAF0" />
                <rect x="99" y="63" width="27" height="27" rx="7" fill="#2B59FF" />
                <path d="m105 76 5 5 10-11" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M99 111h106M99 123h80M99 145h105M99 157h61" stroke="#CDD6EE" strokeWidth="3" strokeLinecap="round" />
              </g>
              <path d="m45 106 115 70 115-70v106a5 5 0 0 1-5 5H50a5 5 0 0 1-5-5V106Z" fill="#EDF1FF" stroke="#829AE0" />
              <path d="m46 214 83-70m145 70-83-70" stroke="#829AE0" />
              <circle cx="160" cy="176" r="22" fill="#2B59FF" />
              <path d="m151 176 6 6 12-13" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M47 44v14m-7-7h14M275 59v10m-5-5h10" stroke="#829AE0" strokeLinecap="round" />
              <circle cx="262" cy="37" r="3" fill="#B9C9F5" />
            </svg>
            <p>A little less guesswork.<br /><em>A little more possibility.</em></p>
            <div className="thank-you-note-bottom"><span>MADE WITH CARE</span><span>VEILCODE STUDIO</span></div>
          </div>
        </section>
        <section className="thank-you-next" aria-labelledby="thank-you-next-title">
          <div className="thank-you-section-heading"><span className="eyebrow">THE NEXT LITTLE STEPS</span><h2 id="thank-you-next-title">From here to your first good idea.</h2></div>
          <ol className="thank-you-steps">
            <li><span className="thank-you-step-number" aria-hidden="true">01</span><div><h3>Check your inbox</h3><p>Look for an email from VeilCode Studio. If it hasn&apos;t arrived after a few minutes, check spam or promotions.</p></div></li>
            <li><span className="thank-you-step-number" aria-hidden="true">02</span><div><h3>Save your download</h3><p>Your link works for {TOKEN_LIFETIME_DAYS} days and up to {MAX_DOWNLOADS} downloads. Keep a copy somewhere you can find it.</p></div></li>
            <li><span className="thank-you-step-number" aria-hidden="true">03</span><div><h3>Make it your own</h3><p>Open your files, find a useful starting point, and put it to work. Small steps count.</p></div></li>
          </ol>
        </section>
        <aside className="thank-you-support"><div><strong>A real person, if you need one.</strong><p>Missing an email or having trouble with a file? We&apos;re here to help.</p></div><a href="mailto:support@veilcode.studio">Get in touch <span aria-hidden="true">↗</span></a></aside>
      </main>
      <footer className="thank-you-footer"><span>Thanks for supporting independent work.</span><span>Frank, VeilCode Studio</span></footer>
    </div>
  );
}

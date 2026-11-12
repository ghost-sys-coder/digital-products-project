"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { OPT_OUT_COOKIE } from "@/lib/tiktok-pixel";

// The TikTok pixel on store pages, and the store's ad-tracking opt-out. The pixel never loads for a
// browser sending a Global Privacy Control signal, or after the shopper opts out on the store.

type Ttq = { track: (event: string, params?: Record<string, unknown>, options?: { event_id?: string }) => void };
type Pending = [string, Record<string, unknown> | undefined, { event_id?: string } | undefined];
declare global {
  interface Window { ttq?: Ttq; __stTtqPending?: Pending[] }
  interface Navigator { globalPrivacyControl?: boolean }
}

function optedOutNow() {
  return navigator.globalPrivacyControl === true || new RegExp(`(?:^|; )${OPT_OUT_COOKIE}=1`).test(document.cookie);
}

/** Reports one event; queues it if the pixel hasn't loaded yet, and does nothing when opted out. */
export function trackTikTok(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window === "undefined" || optedOutNow()) return;
  const options = eventId ? { event_id: eventId } : undefined;
  if (window.ttq) window.ttq.track(event, params, options);
  else (window.__stTtqPending ??= []).push([event, params, options]);
}

/** Fires one event when the page shows, e.g. ViewContent on the store or Purchase on the thank-you page. */
export function TikTokEvent({ event, params, eventId }: { event: string; params: Record<string, unknown>; eventId?: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackTikTok(event, params, eventId);
  }, [event, params, eventId]);
  return null;
}

const subscribe = () => () => {};
const readChoice = () => navigator.globalPrivacyControl === true ? "gpc" : new RegExp(`(?:^|; )${OPT_OUT_COOKIE}=1`).test(document.cookie) ? "out" : "in";

/** "Your privacy choices": opt out of ad tracking on this store (a US state privacy right). */
export function AdChoices() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => null);
  if (choice === null) return null;
  if (choice === "gpc") return <p className="st-choices-status" role="status">Your browser is sending a Global Privacy Control signal, so we don&apos;t share your information for advertising.</p>;
  const set = (out: boolean) => {
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = out ? `${OPT_OUT_COOKIE}=1; path=/; max-age=31536000; samesite=lax${secure}` : `${OPT_OUT_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
    if (out) document.cookie = `st_ttclid=; path=/; max-age=0; samesite=lax${secure}`;
    // Reload so the pixel is loaded, or not, from a clean page.
    location.reload();
  };
  return <div className="st-choices">
    <p className="st-choices-status" role="status">{choice === "out" ? "You've opted out: we don't share your information with TikTok for advertising on this browser." : "We currently use the TikTok pixel on this browser to measure our ads."}</p>
    <button type="button" className="st-button small" onClick={() => set(choice !== "out")}>{choice === "out" ? "Allow ad measurement again" : "Don't share my information for ads"}</button>
  </div>;
}

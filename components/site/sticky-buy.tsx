"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A buy bar pinned to the bottom of the screen on phones and tablets (app/studio.css hides it on desktop).
 * It slides in once the page's main buy button has scrolled up out of view, and away again when it returns.
 */
export function StickyBuy({ targetId, children }: { targetId: string; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);
  return <div className="vc-buybar" data-shown={shown || undefined} aria-hidden={!shown} inert={!shown}>{children}</div>;
}

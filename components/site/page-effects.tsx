"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for studio pages (homepage and product pages): sections rise in as they scroll into view, the header
 * gains its frosted state once the page moves, and it sits below the staging banner when one is shown.
 * Without JavaScript, or with reduced motion, everything is simply visible.
 */
export function PageEffects({ rootId }: { rootId: string }) {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const cleanups: (() => void)[] = [];

    const banner = document.querySelector<HTMLElement>(".environment-banner");
    if (banner) {
      const size = () => root.style.setProperty("--vc-top", `${banner.offsetHeight}px`);
      size();
      const resize = new ResizeObserver(size);
      resize.observe(banner);
      cleanups.push(() => resize.disconnect());
    }

    const header = root.querySelector<HTMLElement>("[data-header]");
    const sentinel = root.querySelector<HTMLElement>("[data-top-sentinel]");
    if (header && sentinel) {
      const stuck = new IntersectionObserver(([entry]) => header.toggleAttribute("data-stuck", !entry.isIntersecting));
      stuck.observe(sentinel);
      cleanups.push(() => stuck.disconnect());
    }

    if (window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
      const reveal = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          reveal.unobserve(entry.target);
        }
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.12 });
      for (const item of root.querySelectorAll<HTMLElement>("[data-reveal]")) {
        // Anything already on screen stays put; only what is still below the fold animates in.
        if (item.getBoundingClientRect().top < window.innerHeight) item.classList.add("is-in");
        else reveal.observe(item);
      }
      root.classList.add("vc-motion");
      cleanups.push(() => reveal.disconnect());
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [rootId]);
  return null;
}

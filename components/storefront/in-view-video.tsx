"use client";

import { useEffect, useRef } from "react";

/** A muted looping clip that only plays while on screen, so long pages stay light on data. */
export function InViewVideo({ src, label, className }: { src: string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { video.controls = true; return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => { video.controls = true; });
      else video.pause();
    }, { threshold: 0.35 });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return <video ref={ref} className={className} src={src} muted loop playsInline preload="metadata" aria-label={label} />;
}

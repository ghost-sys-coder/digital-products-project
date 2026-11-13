"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The hero's product stage. With a mouse or trackpad the covers drift slightly against the pointer, at
 * different depths, so they read as objects rather than flat pictures. Positions are written to CSS
 * variables once per frame; React never re-renders for them. Touch screens and reduced motion get a still stage.
 */
export function HeroStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = ref.current;
    if (!stage || !window.matchMedia("(prefers-reduced-motion: no-preference) and (pointer: fine)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      stage.style.setProperty("--px", x.toFixed(3));
      stage.style.setProperty("--py", y.toFixed(3));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
    const move = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      x = (event.clientX - box.left) / box.width - 0.5;
      y = (event.clientY - box.top) / box.height - 0.5;
      schedule();
    };
    const leave = () => { x = 0; y = 0; schedule(); };
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerleave", leave);
    return () => {
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={ref} className="vc-stage">{children}</div>;
}

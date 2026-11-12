"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

type Props = {
  src: string; label: string; poster?: string | null; className?: string;
  /** Show a sound toggle, for clips meant to be watched (UGC, demos), not background loops. */
  sound?: boolean;
  /** In a gallery, only the visible slide plays. */
  active?: boolean;
};

/**
 * Muted, looping store video that plays only while on screen and active, like short-form apps.
 * Visitors who asked their device to reduce motion get a still poster and normal controls instead.
 */
export function StoreVideo({ src, label, poster, className, sound = false, active = true }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    const video = ref.current;
    if (!video) return () => query.removeEventListener("change", update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(video);
    return () => { observer.disconnect(); query.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (visible && active && !reduced) video.play().catch(() => { /* autoplay refused: the poster and controls remain */ });
    else video.pause();
  }, [visible, active, reduced]);

  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted]);

  return (
    <div className="st-video-wrap">
      <video ref={ref} className={className} src={src} poster={poster ?? undefined} muted loop playsInline
        preload={poster ? "none" : "metadata"} controls={reduced} aria-label={label} />
      {sound && !reduced && (
        <button type="button" className="st-sound" onClick={() => setMuted((value) => !value)}
          aria-pressed={!muted} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
          {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
        </button>
      )}
    </div>
  );
}

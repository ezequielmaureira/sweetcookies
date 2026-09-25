"use client";

import { useEffect, useRef } from "react";

type ParallaxProps = {
  /** Fracción del scroll aplicada como desplazamiento (ej. 0.06 = muy leve). */
  speed?: number;
  className?: string;
  children: React.ReactNode;
};

/** Parallax vertical muy sutil. Desactivado con prefers-reduced-motion. */
export function Parallax({ speed = 0.06, className, children }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      if (reduced.matches) {
        el.style.transform = "";
        return;
      }
      const rect = el.getBoundingClientRect();
      const offset = rect.top + rect.height / 2 - window.innerHeight / 2;
      el.style.transform = `translate3d(0, ${(-offset * speed).toFixed(2)}px, 0)`;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [speed]);

  return (
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

// Low-resolution generated water ripples, drawn small and stretched so it reads like soft video.
export default function Water({ on }: { on: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("bg-on", on);
    const cv = ref.current;
    if (!on || !cv) return;
    const cx = cv.getContext("2d", { alpha: false });
    if (!cx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = matchMedia("(prefers-color-scheme: dark)");
    let W = 160, H = 90, img = cx.createImageData(W, H), raf = 0, last = 0;
    const t0 = performance.now();

    const size = () => {
      W = 160;
      H = Math.max(60, Math.round(W / (innerWidth / innerHeight)));
      cv.width = W;
      cv.height = H;
      img = cx.createImageData(W, H);
    };

    const frame = (now: number) => {
      if (!still) raf = requestAnimationFrame(frame);
      if (now - last < 50 && !still) return;
      last = now;
      const t = (now - t0) / 1000, d = img.data, dk = dark.matches;
      const base = dk ? [18, 22, 24] : [238, 239, 234];
      const deep = dk ? [10, 34, 40] : [184, 199, 200];
      const hi = dk ? [64, 92, 98] : [253, 253, 249];
      const c1x = W * (0.5 + 0.32 * Math.sin(t * 0.11)), c1y = H * (0.5 + 0.3 * Math.cos(t * 0.09));
      const c2x = W * (0.5 + 0.4 * Math.cos(t * 0.07 + 1)), c2y = H * (0.5 + 0.35 * Math.sin(t * 0.13 + 2));
      let i = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const a = Math.sin(x * 0.11 + t * 0.8 + Math.sin(y * 0.08 + t * 0.35) * 1.7);
          const b = Math.sin(y * 0.13 - t * 0.6 + Math.sin(x * 0.06 - t * 0.45) * 1.9);
          const r1 = Math.sin(Math.hypot(x - c1x, y - c1y) * 0.42 - t * 2.1);
          const r2 = Math.sin(Math.hypot(x - c2x, y - c2y) * 0.37 - t * 1.7);
          const v = (a + b + 0.7 * r1 + 0.6 * r2) / 3.3, ca = Math.pow(1 - Math.abs(v), 5), sh = 0.5 + 0.25 * (a + b) * 0.5;
          const g = (Math.random() - 0.5) * (dk ? 6 : 9);
          for (let c = 0; c < 3; c++) d[i + c] = base[c] + (deep[c] - base[c]) * sh + (hi[c] - base[c]) * ca * 0.9 + g;
          d[i + 3] = 255;
          i += 4;
        }
      cx.putImageData(img, 0, 0);
    };

    const onResize = () => {
      size();
      if (still) frame(performance.now());
    };
    size();
    raf = requestAnimationFrame(frame);
    addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", onResize);
    };
  }, [on]);

  return <canvas id="water" ref={ref} aria-hidden="true" />;
}

"use client";

import { useEffect, useRef, useState } from "react";

// Moving backgrounds, drawn small and stretched so they read like soft video.
// Each one follows the cursor (or your finger) a little.
export type BgMode = "off" | "water" | "fog" | "contour" | "dusk" | "leak" | "bokeh";
export const BACKDROPS: { mode: BgMode; label: string }[] = [
  { mode: "water", label: "Water" },
  { mode: "fog", label: "Fog" },
  { mode: "contour", label: "Contour" },
  { mode: "dusk", label: "Dusk" },
  { mode: "leak", label: "Light leak" },
  { mode: "bokeh", label: "Bokeh" },
  { mode: "off", label: "Off" },
];

type RGB = [number, number, number];
type Pointer = { x: number; y: number; tx: number; ty: number; stir: number };
// Writes one pixel's color into out. x, y in pixels; m is the pointer in pixels.
type Shader = (out: number[], x: number, y: number, t: number, W: number, H: number, mx: number, my: number, stir: number, dk: boolean) => void;

const hash = (x: number, y: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const noise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number) => noise(x, y) * 0.5 + noise(x * 2.03 + 5.2, y * 2.03 + 1.3) * 0.3 + noise(x * 4.1 + 9.1, y * 4.1 + 3.7) * 0.2;
const mix = (out: number[], a: RGB, b: RGB, k: number) => {
  for (let c = 0; c < 3; c++) out[c] = a[c] + (b[c] - a[c]) * k;
};
const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const water: Shader = (o, x, y, t, W, H, mx, my, stir, dk) => {
  const c1x = W * (0.5 + 0.32 * Math.sin(t * 0.11)), c1y = H * (0.5 + 0.3 * Math.cos(t * 0.09));
  const c2x = W * (0.5 + 0.4 * Math.cos(t * 0.07 + 1)), c2y = H * (0.5 + 0.35 * Math.sin(t * 0.13 + 2));
  const a = Math.sin(x * 0.11 + t * 0.8 + Math.sin(y * 0.08 + t * 0.35) * 1.7);
  const b = Math.sin(y * 0.13 - t * 0.6 + Math.sin(x * 0.06 - t * 0.45) * 1.9);
  const r1 = Math.sin(Math.hypot(x - c1x, y - c1y) * 0.42 - t * 2.1);
  const r2 = Math.sin(Math.hypot(x - c2x, y - c2y) * 0.37 - t * 1.7);
  // Rings spreading from the pointer, stronger while it moves.
  const dm = Math.hypot(x - mx, y - my);
  const r3 = Math.sin(dm * 0.55 - t * 3.4) * Math.exp(-dm / (14 + 10 * stir)) * (0.5 + 1.4 * stir);
  const v = (a + b + 0.7 * r1 + 0.6 * r2 + r3) / 3.6, ca = Math.pow(1 - Math.abs(v), 5), sh = 0.5 + 0.25 * (a + b) * 0.5;
  const base: RGB = dk ? [18, 22, 24] : [238, 239, 234], deep: RGB = dk ? [10, 34, 40] : [184, 199, 200], hi: RGB = dk ? [64, 92, 98] : [253, 253, 249];
  for (let c = 0; c < 3; c++) o[c] = base[c] + (deep[c] - base[c]) * sh + (hi[c] - base[c]) * ca * 0.9;
};

const fog: Shader = (o, x, y, t, W, H, mx, my, stir, dk) => {
  const q = fbm(x * 0.02 + t * 0.03, y * 0.024 - t * 0.01);
  let v = fbm(x * 0.028 + q * 1.6 - t * 0.025, y * 0.034 + q * 1.2 + t * 0.008);
  // The pointer parts the fog.
  const s = W * (0.13 + 0.05 * stir), d2 = (x - mx) ** 2 + (y - my) ** 2;
  v *= 1 - 0.6 * Math.exp(-d2 / (2 * s * s));
  mix(o, dk ? [13, 14, 15] : [243, 242, 237], dk ? [62, 66, 68] : [196, 200, 199], smooth(0.25, 0.75, v));
};

const contour: Shader = (o, x, y, t, W, H, mx, my, stir, dk) => {
  const s = W * 0.11, d2 = (x - mx) ** 2 + (y - my) ** 2;
  // Height of the land, with a hill where the pointer is.
  const h = fbm(x * 0.016 + t * 0.012, y * 0.016 - t * 0.009) + 0.38 * Math.exp(-d2 / (2 * s * s));
  const f = h * 9, k = Math.abs((f - Math.floor(f)) - 0.5) * 2;
  const major = Math.floor(f) % 5 === 0 ? 1 : 0.55;
  const line = smooth(0.8, 0.97, k) * major;
  mix(o, dk ? [16, 16, 15] : [244, 242, 236], dk ? [104, 108, 100] : [150, 138, 116], line * 0.6);
};

const dusk: Shader = (o, x, y, t, W, H, mx, my, stir, dk) => {
  const v = Math.min(1, Math.max(0, y / H + 0.07 * Math.sin(x * 0.025 + t * 0.15) + 0.12 * (fbm(x * 0.012 + t * 0.02, y * 0.05) - 0.5)));
  const top: RGB = dk ? [12, 14, 26] : [222, 226, 238], mid: RGB = dk ? [44, 24, 40] : [238, 220, 220], low: RGB = dk ? [62, 36, 30] : [247, 234, 216];
  if (v < 0.55) mix(o, top, mid, v / 0.55);
  else mix(o, mid, low, (v - 0.55) / 0.45);
  // A low sun that follows the pointer.
  const s = W * 0.2, g = Math.exp(-((x - mx) ** 2 + ((y - my) * 1.3) ** 2) / (2 * s * s)) * (0.75 + 0.25 * Math.sin(t * 0.6));
  const sun: RGB = dk ? [150, 80, 50] : [255, 232, 196];
  for (let c = 0; c < 3; c++) o[c] += (sun[c] - o[c]) * g * 0.7;
};

const leak: Shader = (o, x, y, t, W, H, mx, my, stir, dk) => {
  const blobs: [number, number, number, RGB][] = [
    [W * (-0.05 + 0.15 * Math.sin(t * 0.13)), H * (0.3 + 0.3 * Math.sin(t * 0.07)), W * 0.35, [255, 120, 50]],
    [W * (1.02 + 0.08 * Math.cos(t * 0.11)), H * (0.75 + 0.2 * Math.cos(t * 0.09 + 1)), W * 0.3, [235, 60, 45]],
    [W * (0.6 + 0.3 * Math.sin(t * 0.05 + 2)), H * -0.1, W * 0.28, [255, 205, 120]],
    [mx, my, W * (0.14 + 0.06 * stir), [255, 170, 90]],
  ];
  const base: RGB = dk ? [14, 12, 11] : [246, 243, 236];
  o[0] = base[0]; o[1] = base[1]; o[2] = base[2];
  for (const [bx, by, r, col] of blobs) {
    const a = Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * r * r)) * (dk ? 0.45 : 0.32);
    for (let c = 0; c < 3; c++) o[c] = dk ? o[c] + col[c] * a * 0.6 : o[c] + (col[c] - o[c]) * a;
  }
};

const SHADERS: Partial<Record<BgMode, { w: number; fn: Shader; grain: number }>> = {
  water: { w: 160, fn: water, grain: 8 },
  fog: { w: 150, fn: fog, grain: 7 },
  contour: { w: 280, fn: contour, grain: 4 },
  dusk: { w: 120, fn: dusk, grain: 9 },
  leak: { w: 140, fn: leak, grain: 16 },
};

// Out-of-focus lights drifting past, nearer ones moving more with the pointer.
function makeBokeh() {
  const dots = Array.from({ length: 30 }, (_, i) => ({
    x: hash(i, 1), y: hash(i, 2), z: 0.3 + hash(i, 3) * 0.7, r: 0.03 + hash(i, 4) * 0.07, hue: hash(i, 5), sp: 0.004 + hash(i, 6) * 0.01,
  }));
  return (cx: CanvasRenderingContext2D, W: number, H: number, t: number, p: Pointer, dk: boolean) => {
    const g = cx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, dk ? "#0d0f14" : "#f1f0ec");
    g.addColorStop(1, dk ? "#17120f" : "#e9e6df");
    cx.globalCompositeOperation = "source-over";
    cx.fillStyle = g;
    cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = dk ? "lighter" : "source-over";
    for (const d of dots) {
      const y = ((((d.y - t * d.sp * d.z) % 1.2) + 1.2) % 1.2) - 0.1;
      const x = d.x + Math.sin(t * 0.1 + d.hue * 6) * 0.02 - (p.x - 0.5) * 0.12 * d.z;
      const px = x * W, py = (y - (p.y - 0.5) * 0.08 * d.z) * H, r = d.r * W * (0.6 + d.z * 0.6);
      const col = d.hue < 0.5 ? (dk ? "255,190,130" : "214,170,120") : d.hue < 0.8 ? (dk ? "150,190,255" : "150,170,200") : dk ? "255,140,160" : "205,150,160";
      const a = (dk ? 0.16 : 0.22) * (0.5 + d.z * 0.5);
      const rg = cx.createRadialGradient(px, py, 0, px, py, r);
      rg.addColorStop(0, `rgba(${col},${a * 0.55})`);
      rg.addColorStop(0.82, `rgba(${col},${a * 0.75})`);
      rg.addColorStop(0.92, `rgba(${col},${a})`);
      rg.addColorStop(1, `rgba(${col},0)`);
      cx.fillStyle = rg;
      cx.beginPath();
      cx.arc(px, py, r, 0, Math.PI * 2);
      cx.fill();
    }
  };
}

export default function Backdrop({ mode }: { mode: BgMode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The background being drawn lags the chosen one while they cross-fade.
  const [drawn, setDrawn] = useState<BgMode>(mode);
  const [visible, setVisible] = useState(false);
  const pointer = useRef<Pointer>({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, stir: 0 });

  useEffect(() => {
    document.documentElement.classList.toggle("bg-on", mode !== "off");
    if (mode === drawn) return;
    setVisible(false);
    const id = setTimeout(() => setDrawn(mode), 450);
    return () => clearTimeout(id);
  }, [mode, drawn]);

  useEffect(() => {
    const p = pointer.current;
    const move = (e: PointerEvent) => {
      const nx = e.clientX / innerWidth, ny = e.clientY / innerHeight;
      p.stir = Math.min(1, p.stir + Math.hypot(nx - p.tx, ny - p.ty) * 4);
      p.tx = nx;
      p.ty = ny;
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    const cv = ref.current;
    if (drawn === "off" || !cv) return;
    const cx = cv.getContext("2d", { alpha: false });
    if (!cx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dark = matchMedia("(prefers-color-scheme: dark)");
    const shader = SHADERS[drawn];
    const bokeh = drawn === "bokeh" ? makeBokeh() : null;
    const p = pointer.current;
    let W = 0, H = 0, img: ImageData | null = null, raf = 0, last = 0, first = true;
    const t0 = performance.now();
    const out = [0, 0, 0];

    const size = () => {
      W = shader?.w ?? 320;
      H = Math.max(60, Math.round(W / (innerWidth / innerHeight)));
      cv.width = W;
      cv.height = H;
      img = shader ? cx.createImageData(W, H) : null;
    };

    const frame = (now: number) => {
      if (!still) raf = requestAnimationFrame(frame);
      if (now - last < 50 && !still && !first) return;
      last = now;
      const t = (now - t0) / 1000, dk = dark.matches;
      p.x += (p.tx - p.x) * 0.08;
      p.y += (p.ty - p.y) * 0.08;
      p.stir *= 0.94;
      if (bokeh) bokeh(cx, W, H, t, p, dk);
      else if (shader && img) {
        const d = img.data, mx = p.x * W, my = p.y * H;
        let i = 0;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            shader.fn(out, x, y, t, W, H, mx, my, p.stir, dk);
            const g = (Math.random() - 0.5) * shader.grain;
            d[i] = out[0] + g;
            d[i + 1] = out[1] + g;
            d[i + 2] = out[2] + g;
            d[i + 3] = 255;
            i += 4;
          }
        cx.putImageData(img, 0, 0);
      }
      if (first) {
        first = false;
        setVisible(true);
      }
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
  }, [drawn]);

  return <canvas id="backdrop" ref={ref} aria-hidden="true" className={visible && drawn !== "off" ? "on" : ""} />;
}

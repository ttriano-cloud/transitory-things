"use client";

import { useEffect, useState } from "react";
import Backdrop, { BACKDROPS, type BgMode } from "./Backdrop";
import { THEMES, applyTheme, readTheme, type Theme } from "@/lib/theme";

// Theme and background, chosen in Settings. The background previews live behind the page.
export default function Appearance() {
  const [theme, setTheme] = useState<Theme>("auto");
  const [bg, setBg] = useState<BgMode>("water");

  useEffect(() => {
    setTheme(readTheme());
    try {
      const b = localStorage.getItem("tt-bg-mode") as BgMode | null;
      if (b && BACKDROPS.some((x) => x.mode === b)) setBg(b);
      else if (localStorage.getItem("tt-bg") === "0") setBg("off");
    } catch {}
  }, []);

  const pickTheme = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    try {
      if (t === "auto") localStorage.removeItem("tt-theme");
      else localStorage.setItem("tt-theme", t);
    } catch {}
  };
  const pickBg = (b: BgMode) => {
    setBg(b);
    try { localStorage.setItem("tt-bg-mode", b); } catch {}
  };

  return (
    <>
      <Backdrop mode={bg} />
      <dt>Mode</dt>
      <dd className="opts" role="group" aria-label="Mode">
        {THEMES.map((x) => (
          <button key={x.v} className="chip up" aria-pressed={theme === x.v} onClick={() => pickTheme(x.v)}>
            {x.label}
          </button>
        ))}
      </dd>
      <dt>Background</dt>
      <dd className="opts" role="group" aria-label="Background">
        {BACKDROPS.map((x) => (
          <button key={x.mode} className="chip up" aria-pressed={bg === x.mode} onClick={() => pickBg(x.mode)}>
            {x.label}
          </button>
        ))}
      </dd>
    </>
  );
}

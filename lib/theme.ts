// Light, dark, or follow the device. Remembered per browser.
export type Theme = "auto" | "light" | "dark";
export const THEMES: { v: Theme; label: string }[] = [
  { v: "light", label: "Light" },
  { v: "dark", label: "Dark" },
  { v: "auto", label: "Auto" },
];

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === "auto") delete el.dataset.theme;
  else el.dataset.theme = t;
}

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem("tt-theme");
    if (t === "light" || t === "dark") return t;
  } catch {}
  return "auto";
}

export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === "light") return false;
  if (t === "dark") return true;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

// Runs before the page paints, so a chosen theme never flashes the other one.
export const THEME_SCRIPT = `try{var t=localStorage.getItem("tt-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

"use client";

import { useEffect, useId, useRef, useState } from "react";

// The dot mark: a sunflower spiral with an open centre, dots growing toward the rim.
// Drawn with fewer, heavier dots than the full artwork so it still reads at type size.
const DOTS = (() => {
  const n = 90, hole = 0.22, R = 48, g = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const r = R * Math.sqrt(hole * hole + (1 - hole * hole) * ((i + 0.5) / n));
    const k = (r / R - hole) / (1 - hole);
    return { x: (50 + r * Math.cos(i * g)).toFixed(2), y: (50 + r * Math.sin(i * g)).toFixed(2), r: (1.3 + 2 * k).toFixed(2) };
  });
})();

export function DotMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
      {DOTS.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} />)}
    </svg>
  );
}

const ITEMS = [
  { href: "/community", label: "Community" },
  { href: "/followers", label: "Followers" },
  { href: "/following", label: "Following" },
  { href: "/settings", label: "Settings" },
];

// The mark beside the wordmark. Click it for the menu.
export default function DotMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const items = () => [...(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") || [])];
    items()[0]?.focus();
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
        return;
      }
      const list = items(), i = list.indexOf(document.activeElement as HTMLElement);
      const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (step) {
        e.preventDefault();
        list[(i + step + list.length) % list.length]?.focus();
      }
      if (e.key === "Tab") setOpen(false);
    };
    addEventListener("pointerdown", onDown);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("pointerdown", onDown);
      removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`dotmenu${open ? " open" : ""}`} ref={wrap}>
      <button
        ref={btn}
        className="dotbtn"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <DotMark className="dotmark" />
      </button>
      <div className="dotpop up" id={id} role="menu" aria-label="Menu" hidden={!open}>
        {ITEMS.map((x) => (
          <a key={x.href} role="menuitem" href={x.href} tabIndex={-1} onClick={() => setOpen(false)}>
            {x.label}
          </a>
        ))}
      </div>
    </div>
  );
}

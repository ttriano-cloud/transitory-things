"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveThing } from "@/lib/save";
import type { Details } from "@/lib/details";
import AddDialog, { type Draft } from "./AddDialog";
import Backdrop, { BACKDROPS, type BgMode } from "./Backdrop";
import ShareDialog from "./ShareDialog";
import DotMenu from "./DotMenu";

export type Thing = {
  id: string;
  name: string;
  url: string | null;
  store: string | null;
  price: number | null;
  currency: string | null;
  board: string | null;
  note: string | null;
  image_url: string | null;
  image_path: string | null;
  // How the photo is framed in the grid: focal point (0-100%) and zoom (1 = fit).
  image_x: number | null;
  image_y: number | null;
  image_zoom: number | null;
  status: "want" | "bought" | "gone";
  is_public: boolean;
  created_at: string;
  // Your own order on the grid; smaller comes first.
  position?: number | null;
  brand?: string | null;
  details?: Details | null;
};
type Tab = "all" | Thing["status"];
type View = "grid" | "scatter" | "lib";
type Sort = "mine" | "new" | "old" | "hi" | "lo";
const SORTS: Sort[] = ["mine", "new", "old", "hi", "lo"];
// Things without a saved position fall in by date, newest first.
const posOf = (x: Thing) => (x.position != null ? Number(x.position) : -Date.parse(x.created_at) / 1000);
const STATUS_NAME = { want: "Wanting", bought: "Bought", gone: "Let go" } as const;

const money = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number(n) % 1 ? 2 : 0 }).format(Number(n));
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : "");
// Stable pseudo-random numbers per thing, so layouts don't reshuffle between visits.
const hsh = (t: string, n: number) => {
  let h = 2166136261;
  for (const c of `${t}|${n}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
};
// The grid crops photos to fit its tiles; this applies the framing chosen when adding.
export const frameStyle = (x: { image_x?: number | null; image_y?: number | null; image_zoom?: number | null }) =>
  ({ "--fx": `${x.image_x ?? 50}%`, "--fy": `${x.image_y ?? 50}%`, "--fz": x.image_zoom ?? 1 }) as React.CSSProperties;
const meta = (x: Thing) => [money(x.price), x.brand, x.store, x.board].filter(Boolean).join(" · ");

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current, t0 = performance.now();
    const d = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
    let raf = 0;
    const step = (t: number) => {
      const k = d ? Math.min(1, (t - t0) / d) : 1, v = start + (value - start) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{money(Math.round(shown))}</>;
}

const VIEWS: { v: View; label: string; dots: number[] }[] = [
  { v: "grid", label: "Grid", dots: [1, 1, 1, 1, 1, 1] },
  { v: "scatter", label: "Gallery", dots: [1, 0, 0, 1, 1, 0] },
  { v: "lib", label: "Single column", dots: [1, 1, 1, 0, 1, 1] },
];

// shared: someone else's things, seen through their share link. Look, don't touch.
export default function Gallery({ initial, email = "", shared = false, owner, home = "/", initialBoard }: { initial: Thing[]; email?: string; shared?: boolean; owner?: string; home?: string; initialBoard?: string }) {
  const sb = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Thing[]>(initial);
  const [tab, setTab] = useState<Tab>("want");
  const [board, setBoard] = useState(initialBoard || "All");
  const [q, setQ] = useState("");
  const [sort, setSortState] = useState<Sort>("mine");
  const [view, setViewState] = useState<View>("grid");
  const [bg, setBgState] = useState<BgMode>("water");
  const [focus, setFocus] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState<{ thing?: Thing; pre?: { url?: string; file?: File } } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  // While dragging, the order shown on screen (ids), before it's saved.
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Remembered per browser: layout, order, and background.
  useEffect(() => {
    try {
      const v = localStorage.getItem("tt-view") as View | null;
      if (v && ["grid", "scatter", "lib"].includes(v)) setViewState(v);
      // A shared board opens in its owner's order.
      const s = shared ? null : (localStorage.getItem("tt-sort") as Sort | null);
      if (s && SORTS.includes(s)) setSortState(s);
      const b = localStorage.getItem("tt-bg-mode") as BgMode | null;
      if (b && BACKDROPS.some((x) => x.mode === b)) setBgState(b);
      else if (localStorage.getItem("tt-bg") === "0") setBgState("off");
    } catch {}
  }, []);
  const setView = (v: View) => {
    was.current.clear();
    setViewState(v);
    try { localStorage.setItem("tt-view", v); } catch {}
  };
  const setSort = (s: Sort) => {
    setSortState(s);
    try { localStorage.setItem("tt-sort", s); } catch {}
  };

  const say = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 3500);
  }, []);

  // A thing opened by itself lives in the address (#id), so Back works.
  useEffect(() => {
    const read = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      setFocus(id || null);
      if (id) window.scrollTo(0, 0);
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  const unfocus = () => {
    history.replaceState(null, "", location.pathname + location.search);
    setFocus(null);
  };

  const byId = useMemo(() => new Map(items.map((x) => [x.id, x])), [items]);
  const boards = useMemo(() => [...new Set(items.map((x) => x.board).filter(Boolean) as string[])].sort(), [items]);
  const inTab = useMemo(() => (tab === "all" ? items : items.filter((x) => x.status === tab)), [items, tab]);
  const visible = useMemo(() => {
    const s = q.toLowerCase();
    const v = inTab.filter((x) => (board === "All" || x.board === board) && (!s || [x.name, x.store, x.brand, x.board, x.note].join(" ").toLowerCase().includes(s)));
    const by: Record<Sort, (a: Thing, b: Thing) => number> = {
      mine: (a, b) => posOf(a) - posOf(b),
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      old: (a, b) => a.created_at.localeCompare(b.created_at),
      hi: (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0),
      lo: (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0),
    };
    return v.sort(by[sort]);
  }, [inTab, board, q, sort]);
  const shown = drag ? (drag.order.map((id) => byId.get(id)).filter(Boolean) as Thing[]) : visible;
  const total = inTab.reduce((a, x) => a + (Number(x.price) || 0), 0);
  const counts = { all: items.length, want: 0, bought: 0, gone: 0 } as Record<Tab, number>;
  items.forEach((x) => counts[x.status]++);
  useEffect(() => {
    if (board !== "All" && !boards.includes(board)) setBoard("All");
  }, [boards, board]);

  // Saving and deleting.
  async function save(d: Draft) {
    const { id, ...fields } = d;
    if (id) {
      const before = items.find((x) => x.id === id);
      const data = await saveThing<Thing>(sb, fields, id);
      setItems((xs) => xs.map((x) => (x.id === id ? data : x)));
      const moved = before && data.status !== before.status;
      say(moved ? `Saved. Moved to ${STATUS_NAME[data.status]}.` : "Saved.");
      if (moved && focus === id && tab !== "all") setTab(data.status);
    } else {
      const data = await saveThing<Thing>(sb, fields);
      setItems((xs) => [data, ...xs]);
      if (tab !== "want" && tab !== "all") setTab("want");
      say("Added to your things.");
    }
    setEditing(null);
  }
  async function remove(x: Thing) {
    setEditing(null);
    if (focus === x.id) unfocus();
    setItems((xs) => xs.filter((i) => i.id !== x.id));
    const { error } = await sb.from("things").delete().eq("id", x.id);
    if (error) {
      setItems((xs) => [x, ...xs]);
      return say("Couldn't delete that.");
    }
    // The photo file is kept until undo has passed, then removed.
    const cleanup = setTimeout(() => x.image_path && sb.storage.from("things").remove([x.image_path]), 6500);
    say(`Deleted “${x.name}”.`, async () => {
      clearTimeout(cleanup);
      const { data } = await sb.from("things").insert(x).select().single();
      if (data) setItems((xs) => [data as Thing, ...xs]);
    });
  }

  // Saves a new order for the things on screen.
  const saveOrder = useCallback(
    async (order: string[], movedId: string) => {
      const list = order.map((id) => byId.get(id)).filter(Boolean) as Thing[];
      let updates: { id: string; position: number }[];
      if (sort === "mine") {
        // Only the moved thing changes: it slots in between its new neighbours.
        const i = list.findIndex((x) => x.id === movedId);
        const prev = list[i - 1], next = list[i + 1], me = list[i];
        if (!me) return;
        const p = prev && next ? (posOf(prev) + posOf(next)) / 2 : prev ? posOf(prev) + 1 : next ? posOf(next) - 1 : posOf(me);
        if (p === posOf(me)) return;
        updates = [{ id: movedId, position: p }];
      } else {
        // Sorted some other way: what's on screen becomes your order.
        const slots = list.map(posOf).sort((a, b) => a - b);
        updates = list.map((x, k) => ({ id: x.id, position: slots[k] })).filter((u) => byId.get(u.id)?.position !== u.position);
        setSort("mine");
      }
      const pos = new Map(updates.map((u) => [u.id, u.position]));
      setItems((xs) => xs.map((x) => (pos.has(x.id) ? { ...x, position: pos.get(x.id)! } : x)));
      const results = await Promise.all(updates.map((u) => sb.from("things").update({ position: u.position }).eq("id", u.id)));
      if (results.some((r) => r.error)) say("The new order shows here but couldn't be saved. Run the latest lines in supabase/schema.sql.");
    },
    [byId, sort, sb, say],
  );

  // Paste or drop an image or link anywhere to start adding.
  useEffect(() => {
    if (shared) {
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && focus && unfocus();
      addEventListener("keydown", onKey);
      return () => removeEventListener("keydown", onKey);
    }
    const onPaste = (e: ClipboardEvent) => {
      if (editing) return;
      const f = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        return setEditing({ pre: { file: f } });
      }
      const t = (e.clipboardData?.getData("text") || "").trim();
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (/^https?:\/\/\S+$/.test(t) && tag !== "input" && tag !== "textarea") {
        e.preventDefault();
        setEditing({ pre: { url: t } });
      }
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      if (editing) return;
      e.preventDefault();
      const f = e.dataTransfer?.files[0];
      if (f && f.type.startsWith("image/")) return setEditing({ pre: { file: f } });
      const t = (e.dataTransfer?.getData("text/uri-list") || e.dataTransfer?.getData("text") || "").split("\n")[0].trim();
      if (/^https?:\/\//.test(t)) setEditing({ pre: { url: t } });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing && focus) unfocus();
    };
    addEventListener("paste", onPaste);
    addEventListener("dragover", onDragOver);
    addEventListener("drop", onDrop);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("paste", onPaste);
      removeEventListener("dragover", onDragOver);
      removeEventListener("drop", onDrop);
      removeEventListener("keydown", onKey);
    };
  }, [editing, focus, shared]);

  // ---- Moving things around ----
  // Press and drag a photo to move it (on a phone, press and hold first).
  const gridRef = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const was = useRef(new Map<string, { x: number; y: number }>());
  const grab = useRef<{ id: string; pid: number; sx: number; sy: number; gx: number; gy: number; px: number; py: number; on: boolean; touch: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const dragged = useRef(false);
  const beginRef = useRef<() => void>(() => {});
  const live = useRef({ shown, drag, saveOrder });
  live.current = { shown, drag, saveOrder };
  const canMove = !shared && view !== "scatter" && !focus;

  // Keeps the lifted photo under the pointer, wherever its slot is now.
  const place = useCallback(() => {
    const g = grab.current, el = g && els.current.get(g.id), grid = gridRef.current;
    if (!g?.on || !el || !grid) return;
    const r = grid.getBoundingClientRect();
    el.style.transform = `translate(${g.px - r.left - g.gx - el.offsetLeft}px, ${g.py - r.top - g.gy - el.offsetTop}px) scale(1.035)`;
  }, []);

  // Others glide to their new places instead of jumping.
  useLayoutEffect(() => {
    const draggingId = grab.current?.on ? grab.current.id : null;
    els.current.forEach((el, id) => {
      const now = { x: el.offsetLeft, y: el.offsetTop }, before = was.current.get(id);
      was.current.set(id, now);
      if (id === draggingId || !before || (before.x === now.x && before.y === now.y)) return;
      if (Math.abs(before.x - now.x) > innerWidth || Math.abs(before.y - now.y) > innerHeight * 1.5) return;
      el.style.transition = "none";
      el.style.transform = `translate(${before.x - now.x}px, ${before.y - now.y}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform .32s cubic-bezier(.2,.75,.25,1)";
        el.style.transform = "";
      });
    });
    place();
  });

  useEffect(() => {
    const begin = () => {
      const g = grab.current;
      if (!g) return;
      g.on = true;
      dragged.current = true;
      const el = els.current.get(g.id);
      if (el) el.style.transition = "none";
      document.documentElement.classList.add("dragging");
      if (g.touch) navigator.vibrate?.(8);
      setDrag({ id: g.id, order: live.current.shown.map((x) => x.id) });
      place();
    };
    const reorder = () => {
      const g = grab.current, d = live.current.drag, grid = gridRef.current, me = g && els.current.get(g.id);
      if (!g?.on || !d || !grid || !me) return;
      const r = grid.getBoundingClientRect();
      // The middle of the lifted photo, in the grid's own coordinates.
      const cx = g.px - r.left - g.gx + me.offsetWidth / 2, cy = g.py - r.top - g.gy + me.offsetHeight / 2;
      let best = g.id, bestD = Infinity;
      for (const id of d.order) {
        const el = els.current.get(id);
        if (!el) continue;
        const dx = el.offsetLeft + el.offsetWidth / 2 - cx, dy = el.offsetTop + el.offsetHeight / 2 - cy;
        const dist = dx * dx + dy * dy;
        if (dist < bestD) [best, bestD] = [id, dist];
      }
      if (best === g.id) return;
      const order = d.order.filter((id) => id !== g.id);
      order.splice(d.order.indexOf(best), 0, g.id);
      setDrag({ id: g.id, order });
    };
    const end = () => {
      const g = grab.current;
      grab.current = null;
      if (!g) return;
      clearTimeout(g.timer);
      if (!g.on) return;
      const el = els.current.get(g.id);
      if (el) {
        // Settle into its new slot (place() left it under the pointer).
        el.style.transition = "transform .3s cubic-bezier(.2,.75,.25,1)";
        el.style.transform = "";
      }
      document.documentElement.classList.remove("dragging");
      const d = live.current.drag;
      if (d) live.current.saveOrder(d.order, g.id);
      setDrag(null);
      setTimeout(() => (dragged.current = false), 0);
    };
    const move = (e: PointerEvent) => {
      const g = grab.current;
      if (!g || e.pointerId !== g.pid) return;
      g.px = e.clientX;
      g.py = e.clientY;
      const far = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
      if (!g.on) {
        if (g.touch) {
          if (far > 10) end(); // scrolling, not moving
          return;
        }
        if (far < 6) return;
        begin();
      }
      place();
      reorder();
      // Near the top or bottom edge, the page scrolls along.
      const edge = e.clientY < 80 ? -1 : e.clientY > innerHeight - 130 ? 1 : 0;
      if (edge) {
        scrollBy(0, edge * 14);
        place();
      }
    };
    beginRef.current = begin;
    const noScroll = (e: TouchEvent) => grab.current?.on && e.preventDefault();
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
    addEventListener("touchmove", noScroll, { passive: false });
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
      removeEventListener("touchmove", noScroll);
    };
  }, [place]);

  const onGrab = (e: React.PointerEvent, x: Thing) => {
    if (!canMove || e.button !== 0 || shown.length < 2) return;
    const el = els.current.get(x.id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const g: NonNullable<typeof grab.current> = { id: x.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, px: e.clientX, py: e.clientY, on: false, touch: e.pointerType !== "mouse" };
    grab.current = g;
    if (g.touch) g.timer = setTimeout(() => grab.current === g && beginRef.current(), 320);
  };
  // With the keyboard: Alt + arrow keys move the focused photo.
  const onKeyMove = (e: React.KeyboardEvent, x: Thing) => {
    if (!canMove || !e.altKey) return;
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const order = shown.map((t) => t.id), i = order.indexOf(x.id), j = i + step;
    if (j < 0 || j >= order.length) return;
    order.splice(i, 1);
    order.splice(j, 0, x.id);
    saveOrder(order, x.id);
    requestAnimationFrame(() => (els.current.get(x.id)?.querySelector(".plate") as HTMLElement | null)?.focus());
  };

  const open = (x: Thing) => {
    if (dragged.current) return;
    location.hash = x.id;
  };

  const links = (x: Thing) => {
    const u = safeUrl(x.url);
    return (
      <>
        {u && <a className="lk" href={u} target="_blank" rel="noopener noreferrer">Visit store ↗</a>}
        {!shared && <button className="lk" onClick={() => setEditing({ thing: x })}>Edit</button>}
      </>
    );
  };

  const pic = (x: Thing) =>
    x.image_url ? <img src={x.image_url} alt="" loading="lazy" draggable={false} style={frameStyle(x)} /> : <span className="noimg">{x.name}</span>;

  const card = (x: Thing, i: number) => {
    const dim = tab === "all" && x.status !== "want" ? " dim" : "";
    const lifting = drag?.id === x.id ? " ghost" : "";
    const plate = (
      <div className="pw">
        <button
          className="plate"
          aria-label={`${x.name}${canMove ? ". Alt and arrow keys move it." : ""}`}
          onClick={() => open(x)}
          onPointerDown={(e) => onGrab(e, x)}
          onKeyDown={(e) => onKeyMove(e, x)}
          onContextMenu={(e) => grab.current?.on && e.preventDefault()}
        >
          {pic(x)}
        </button>
      </div>
    );
    const ref = (el: HTMLElement | null) => {
      if (el) els.current.set(x.id, el);
      else {
        els.current.delete(x.id);
        was.current.delete(x.id);
      }
    };
    if (view === "scatter") {
      const span = [3, 3, 4, 4, 5][Math.floor(hsh(x.id, 1) * 5)];
      const lo = i % 2 ? 7 : 1, hi = i % 2 ? 13 - span : 7 - span;
      const start = lo + Math.floor(hsh(x.id, 2) * Math.max(1, hi - lo + 1));
      const mt = Math.floor(hsh(x.id, 3) * 5) * 40, mw = 58 + Math.floor(hsh(x.id, 4) * 30), ml = Math.floor(hsh(x.id, 5) * (100 - mw));
      const style = { gridColumn: `${start} / span ${span}`, marginTop: mt, ["--mw" as string]: `${mw}%`, ["--ml" as string]: `${ml}%` } as React.CSSProperties;
      return (
        <article key={x.id} ref={ref} className={`card${dim}`} style={style}>
          {plate}
          <div className="cap">
            <b>{x.name}</b>
            <span>{x.note || [money(x.price), x.brand || x.store].filter(Boolean).join(" · ")}</span>
          </div>
        </article>
      );
    }
    return (
      <article key={x.id} ref={ref} className={`card${dim}${lifting}`}>
        {plate}
        <div className="cap hov">
          <div className="capline">
            <b>{x.name}</b>
            {x.price != null && <span className="pr">{money(x.price)}</span>}
          </div>
          <div className="capline sub">
            <span>{x.brand || x.store || ""}</span>
            <span className="capacts">{links(x)}</span>
          </div>
        </div>
      </article>
    );
  };

  const f = focus ? items.find((x) => x.id === focus) : null;
  const fd = f?.details || {};
  const empty = {
    all: "Nothing here yet. Paste a link or an image anywhere to add your first thing.",
    want: "Nothing here yet. Paste a link or an image anywhere to add your first thing.",
    bought: "Things you buy will rest here. Mark something bought from its Edit menu.",
    gone: "Things you let go of will rest here. Most wants pass.",
  }[tab];
  const emptyShared = { all: "Nothing here yet.", want: "Nothing here yet.", bought: "Nothing bought yet.", gone: "Nothing let go yet." }[tab];
  // Whose things these are, shown at the top: "Trevor's Things".
  const who = owner ? owner.charAt(0).toUpperCase() + owner.slice(1) : "";

  return (
    <>
      <Backdrop mode={bg} />

      {!f && (
        <header className="band head">
          <div className="chips" aria-label="Boards">
            {["All", ...boards].map((b) => (
              <button key={b} className="chip up" aria-pressed={b === board} onClick={() => setBoard(b)}>
                {b}
              </button>
            ))}
          </div>
          <h1 className="owner up">
            {who ? <>{who}’s <span>Things</span></> : <>Shared <span>Things</span></>}
          </h1>
          <div className="tools">
            <label className="search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input className="up" type="search" placeholder="Search" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className="up" aria-label="Order" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="mine">Your order</option>
              <option value="new">Newest</option>
              <option value="old">Oldest</option>
              <option value="hi">Price, high</option>
              <option value="lo">Price, low</option>
            </select>
          </div>
        </header>
      )}

      {f && (
        <section className="band focus">
          <button className="lk" onClick={unfocus} style={{ fontSize: 14, marginBottom: 12 }}>← All things</button>
          <div className="fimg">{f.image_url ? <img src={f.image_url} alt="" /> : <span className="noimg">{f.name}</span>}</div>
          <h2>{f.name}</h2>
          <div className="dmeta">
            {meta(f)}
            {fd.original_price ? <> · <s>{money(fd.original_price)}</s></> : null}
          </div>
          {(fd.color || fd.size || fd.availability) && <div className="dmeta">{[fd.color, fd.size && `Size ${fd.size}`, fd.availability].filter(Boolean).join(" · ")}</div>}
          {f.note && <p className="dnote">{f.note}</p>}
          {fd.description && <p className="dnote ddesc">{fd.description}</p>}
          <div className="dacts">{links(f)}</div>
        </section>
      )}

      <main className="band">
        <div key={view} ref={gridRef} className={`grid l-${view}${drag ? " moving" : ""}`}>
          {shown.length ? shown.map(card) : <div className="empty">{q ? "No things match that search." : shared ? emptyShared : empty}</div>}
        </div>
        {shared ? (
          <div className="where">
            <span>{owner ? `${owner}’s things` : "Shared things"}, kept on Transitory Things</span>
            <a className="lk" style={{ fontSize: 12 }} href={home}>Keep your own</a>
          </div>
        ) : (
          <div className="where">
            <span>{email}</span>
            <form action="/auth/signout" method="post" style={{ display: "inline" }}>
              <button className="lk" style={{ fontSize: 12 }}>Sign out</button>
            </form>
          </div>
        )}
      </main>

      <nav className="dock band" aria-label="Main">
        <div className="tabs up">
          {(["all", "want", "bought", "gone"] as Tab[]).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {{ all: "All", want: "Wanting", bought: "Bought", gone: "Let go" }[t]}
              <sup>{counts[t] || ""}</sup>
            </button>
          ))}
          <span className="meta" aria-live="polite">
            <span>{inTab.length} {inTab.length === 1 ? "thing" : "things"}</span>
            <span className="sum"><CountUp value={total} /></span>
          </span>
          {!shared && (
            <>
              <button className="soft" onClick={() => setEditing({})}>Add +</button>
              <button className="soft" onClick={() => setSharing(true)} title="Get a link to share your things">Share</button>
            </>
          )}
        </div>
        <div className="views" role="group" aria-label="Layout">
          {VIEWS.map(({ v, label, dots }) => (
            <button key={v} aria-pressed={view === v} aria-label={`${label} layout`} title={label} onClick={() => setView(v)}>
              {dots.map((d, i) => <i key={i} className={d ? "on" : ""} />)}
            </button>
          ))}
        </div>
        <div className="brandrow">
          <a className="brand up" href="/" onClick={(e) => { if (focus || shared) { e.preventDefault(); if (focus) unfocus(); else window.scrollTo({ top: 0, behavior: "smooth" }); } }}>
            Transitory <span>Things</span>
          </a>
          {!shared && <DotMenu />}
        </div>
      </nav>

      {sharing && <ShareDialog sb={sb} board={board} onClose={() => setSharing(false)} say={say} />}

      {editing && (
        <AddDialog
          thing={editing.thing}
          pre={editing.pre}
          boards={boards}
          defaultBoard={editing.thing ? "" : board !== "All" ? board : ""}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={editing.thing ? () => remove(editing.thing!) : undefined}
        />
      )}

      <div className={`toast${toast ? " on" : ""}`} role="status">
        <span>{toast?.msg}</span>
        {toast?.undo && (
          <button onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button>
        )}
      </div>
    </>
  );
}

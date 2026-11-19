"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AddDialog, { type Draft } from "./AddDialog";
import Water from "./Water";

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
};
type Tab = "all" | Thing["status"];
type View = "grid" | "scatter" | "lib";

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
const meta = (x: Thing) => [money(x.price), x.store, x.board].filter(Boolean).join(" · ");

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

export default function Gallery({ initial, email }: { initial: Thing[]; email: string }) {
  const sb = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Thing[]>(initial);
  const [tab, setTab] = useState<Tab>("want");
  const [board, setBoard] = useState("All");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("new");
  const [view, setViewState] = useState<View>("grid");
  const [bg, setBg] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ thing?: Thing; pre?: { url?: string; file?: File } } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Remembered per browser: layout and background.
  useEffect(() => {
    try {
      const v = localStorage.getItem("tt-view") as View | null;
      if (v && ["grid", "scatter", "lib"].includes(v)) setViewState(v);
      setBg(localStorage.getItem("tt-bg") !== "0");
    } catch {}
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    setOpen(null);
    try { localStorage.setItem("tt-view", v); } catch {}
  };
  const toggleBg = () => {
    setBg((b) => {
      try { localStorage.setItem("tt-bg", b ? "0" : "1"); } catch {}
      return !b;
    });
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
      if (id) {
        setOpen(null);
        window.scrollTo(0, 0);
      }
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  const unfocus = () => {
    history.replaceState(null, "", location.pathname + location.search);
    setFocus(null);
  };

  const boards = useMemo(() => [...new Set(items.map((x) => x.board).filter(Boolean) as string[])].sort(), [items]);
  const inTab = useMemo(() => (tab === "all" ? items : items.filter((x) => x.status === tab)), [items, tab]);
  const visible = useMemo(() => {
    const s = q.toLowerCase();
    const v = inTab.filter((x) => (board === "All" || x.board === board) && (!s || [x.name, x.store, x.board, x.note].join(" ").toLowerCase().includes(s)));
    const by: Record<string, (a: Thing, b: Thing) => number> = {
      new: (a, b) => b.created_at.localeCompare(a.created_at),
      old: (a, b) => a.created_at.localeCompare(b.created_at),
      hi: (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0),
      lo: (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0),
    };
    return v.sort(by[sort]);
  }, [inTab, board, q, sort]);
  const total = inTab.reduce((a, x) => a + (Number(x.price) || 0), 0);
  const counts = { all: items.length, want: 0, bought: 0, gone: 0 } as Record<Tab, number>;
  items.forEach((x) => counts[x.status]++);
  useEffect(() => {
    if (board !== "All" && !boards.includes(board)) setBoard("All");
  }, [boards, board]);

  // Saving, status changes, deleting.
  async function save(d: Draft) {
    const { id, ...fields } = d;
    if (id) {
      const { data, error } = await sb.from("things").update(fields).eq("id", id).select().single();
      if (error) throw error;
      setItems((xs) => xs.map((x) => (x.id === id ? (data as Thing) : x)));
      say("Saved.");
    } else {
      const { data, error } = await sb.from("things").insert(fields).select().single();
      if (error) throw error;
      setItems((xs) => [data as Thing, ...xs]);
      if (tab !== "want" && tab !== "all") setTab("want");
      say("Added to your things.");
    }
    setEditing(null);
  }
  async function setStatus(x: Thing, status: Thing["status"]) {
    const prev = x.status;
    setItems((xs) => xs.map((i) => (i.id === x.id ? { ...i, status } : i)));
    setOpen(null);
    const { error } = await sb.from("things").update({ status }).eq("id", x.id);
    if (error) {
      setItems((xs) => xs.map((i) => (i.id === x.id ? { ...i, status: prev } : i)));
      return say("Couldn't save that change.");
    }
    const msg = { bought: "Marked as bought.", gone: "Let go. It’s in Let go if you change your mind.", want: "Back in Wanting." }[status];
    say(msg, () => setStatus({ ...x, status }, prev));
  }
  async function remove(x: Thing) {
    setEditing(null);
    setOpen(null);
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
  function act(a: string, x: Thing) {
    if (a === "open") location.hash = x.id;
    else if (a === "edit") setEditing({ thing: x });
    else setStatus(x, a as Thing["status"]);
  }

  // Paste or drop an image or link anywhere to start adding.
  useEffect(() => {
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
      if (e.key !== "Escape" || editing) return;
      if (open) setOpen(null);
      else if (focus) unfocus();
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (open && !t.closest(".card.sel") && !t.closest("dialog") && !t.closest(".toast")) setOpen(null);
    };
    addEventListener("paste", onPaste);
    addEventListener("dragover", onDragOver);
    addEventListener("drop", onDrop);
    addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      removeEventListener("paste", onPaste);
      removeEventListener("dragover", onDragOver);
      removeEventListener("drop", onDrop);
      removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [editing, open, focus]);

  // One click shows details over the photo; a double click opens it by itself.
  const onPlateClick = (id: string) => {
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => setOpen((o) => (o === id ? null : id)), 230);
  };
  const onPlateDouble = (id: string) => {
    clearTimeout(clickTimer.current);
    location.hash = id;
  };

  const actions = (x: Thing) => {
    const out: React.ReactNode[] = [];
    const u = safeUrl(x.url);
    if (u) out.push(<a key="v" className="lk" href={u} target="_blank" rel="noopener noreferrer">Visit store ↗</a>);
    if (x.status !== "bought") out.push(<button key="b" className="lk" onClick={() => act("bought", x)}>Bought</button>);
    if (x.status !== "gone") out.push(<button key="g" className="lk" onClick={() => act("gone", x)}>Let go</button>);
    if (x.status !== "want") out.push(<button key="w" className="lk" onClick={() => act("want", x)}>Want again</button>);
    out.push(<button key="e" className="lk" onClick={() => act("edit", x)}>Edit</button>);
    return out;
  };

  const pic = (x: Thing) =>
    x.image_url ? <img src={x.image_url} alt="" loading="lazy" style={frameStyle(x)} /> : <span className="noimg">{x.name}</span>;

  const card = (x: Thing, i: number) => {
    const dim = tab === "all" && x.status !== "want" ? " dim" : "";
    const sel = open === x.id ? " sel" : "";
    const plate = (
      <div className="pw">
        <button className="plate" aria-label={x.name} onClick={() => onPlateClick(x.id)} onDoubleClick={() => onPlateDouble(x.id)}>
          {pic(x)}
        </button>
        {open === x.id && (
          <div className="ov" role="region" aria-label={x.name}>
            <div className="ovname">{x.name}</div>
            <div className="ovcat">({x.board || x.store || "Thing"})</div>
            <ul className="ovlist">
              {x.price != null && <li>{money(x.price)}</li>}
              {x.store && <li>{x.store}</li>}
              {x.note && <li className="note2">{x.note}</li>}
            </ul>
            <ul className="ovacts">
              {[...actions(x), <button key="o" className="lk" onClick={() => act("open", x)}>View</button>].map((n, k) => (
                <li key={k}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
    if (view === "scatter") {
      const span = [3, 3, 4, 4, 5][Math.floor(hsh(x.id, 1) * 5)];
      const lo = i % 2 ? 7 : 1, hi = i % 2 ? 13 - span : 7 - span;
      const start = lo + Math.floor(hsh(x.id, 2) * Math.max(1, hi - lo + 1));
      const mt = Math.floor(hsh(x.id, 3) * 5) * 40, mw = 58 + Math.floor(hsh(x.id, 4) * 30), ml = Math.floor(hsh(x.id, 5) * (100 - mw));
      const style = { gridColumn: `${start} / span ${span}`, marginTop: mt, ["--mw" as string]: `${mw}%`, ["--ml" as string]: `${ml}%` } as React.CSSProperties;
      return (
        <article key={x.id} className={`card${dim}${sel}`} style={style}>
          {plate}
          <div className="cap">
            <b>{x.name}</b>
            <span>{x.note || [money(x.price), x.store].filter(Boolean).join(" · ")}</span>
          </div>
        </article>
      );
    }
    return (
      <article key={x.id} className={`card${dim}${sel}`}>
        {plate}
      </article>
    );
  };

  const f = focus ? items.find((x) => x.id === focus) : null;
  const empty = {
    all: "Nothing here yet. Paste a link or an image anywhere to add your first thing.",
    want: "Nothing here yet. Paste a link or an image anywhere to add your first thing.",
    bought: "Things you buy will rest here.",
    gone: "Things you let go of will rest here. Most wants pass.",
  }[tab];

  return (
    <>
      <Water on={bg} />

      {!f && (
        <header className="band head">
          <div className="chips" aria-label="Boards">
            {["All", ...boards].map((b) => (
              <button key={b} className="chip up" aria-pressed={b === board} onClick={() => setBoard(b)}>
                {b}
              </button>
            ))}
          </div>
          <div className="meta">
            <span>{inTab.length} {inTab.length === 1 ? "thing" : "things"}</span>
            <span className="sum"><CountUp value={total} /></span>
          </div>
          <div className="tools">
            <label className="search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input className="up" type="search" placeholder="Search" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className="up" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
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
          <div className="dmeta">{meta(f)}</div>
          {f.note && <p className="dnote">{f.note}</p>}
          <div className="dacts">{actions(f)}</div>
        </section>
      )}

      <main className="band">
        <div className={`grid l-${view}`}>
          {visible.length ? visible.map(card) : <div className="empty">{q ? "No things match that search." : empty}</div>}
        </div>
        <div className="where">
          <span>{email}</span>
          <form action="/auth/signout" method="post" style={{ display: "inline" }}>
            <button className="lk" style={{ fontSize: 12 }}>Sign out</button>
          </form>
        </div>
      </main>

      <nav className="dock band" aria-label="Main">
        <div className="tabs up">
          {(["all", "want", "bought", "gone"] as Tab[]).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => { setTab(t); setOpen(null); }}>
              {{ all: "All", want: "Wanting", bought: "Bought", gone: "Let go" }[t]}
              <sup>{counts[t] || ""}</sup>
            </button>
          ))}
          <button className="soft" onClick={() => setEditing({})}>Add +</button>
          <a className="soft" href="/save-button" title="Save things from any shop">Save button</a>
          <button className="soft" aria-pressed={bg} onClick={toggleBg} title="Water background">BG</button>
        </div>
        <div className="views" role="group" aria-label="Layout">
          {VIEWS.map(({ v, label, dots }) => (
            <button key={v} aria-pressed={view === v} aria-label={`${label} layout`} title={label} onClick={() => setView(v)}>
              {dots.map((d, i) => <i key={i} className={d ? "on" : ""} />)}
            </button>
          ))}
        </div>
        <a className="brand up" href="/" onClick={(e) => { if (focus) { e.preventDefault(); unfocus(); } }}>
          Transitory <span>Things</span>
        </a>
      </nav>

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

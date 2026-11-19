"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { frameStyle, type Thing } from "./Gallery";

type Photo =
  | { kind: "none" }
  | { kind: "existing"; url: string; path: string | null }
  | { kind: "remote"; url: string }
  | { kind: "file"; file: Blob; preview: string };

export type Draft = Omit<Thing, "id" | "created_at" | "status" | "is_public"> & { id?: string };

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// Shrinks very large photos before upload so the gallery stays fast.
async function shrink(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const max = 1800, r = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (r === 1 && file.size < 2_500_000) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * r);
  c.height = Math.round(bmp.height * r);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.86));
}

export default function AddDialog({
  thing,
  pre,
  boards,
  defaultBoard,
  onClose,
  onSave,
  onDelete,
}: {
  thing?: Thing;
  pre?: { url?: string; file?: File; html?: string };
  boards: string[];
  defaultBoard: string;
  onClose: () => void;
  onSave: (d: Draft) => Promise<void>;
  onDelete?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(thing?.url || pre?.url || "");
  const [name, setName] = useState(thing?.name || "");
  const [store, setStore] = useState(thing?.store || host(pre?.url || ""));
  const [price, setPrice] = useState(thing?.price != null ? String(thing.price) : "");
  const [board, setBoard] = useState(thing?.board || defaultBoard);
  const [note, setNote] = useState(thing?.note || "");
  const [photo, setPhoto] = useState<Photo>(thing?.image_url ? { kind: "existing", url: thing.image_url, path: thing.image_path } : { kind: "none" });
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "import" | "save">("");
  const [msg, setMsg] = useState("");
  const [over, setOver] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // Framing: where the photo is centered (0-100%) and how far it's zoomed in.
  const [fx, setFx] = useState(thing?.image_x ?? 50);
  const [fy, setFy] = useState(thing?.image_y ?? 50);
  const [fz, setFz] = useState(thing?.image_zoom ?? 1);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number; w: number; h: number; moved: boolean } | null>(null);
  const firstPreview = useRef<string | null>(null);
  const imported = useRef("");

  useEffect(() => {
    ref.current?.showModal();
    if (pre?.file) takeFile(pre.file);
    if (pre?.url) doImport(pre.url, pre.html);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function takeFile(f: Blob) {
    if (!f.type.startsWith("image/")) return;
    setPhoto({ kind: "file", file: f, preview: URL.createObjectURL(f) });
  }

  async function doImport(link: string, html?: string) {
    link = link.trim();
    if (!/^https?:\/\//i.test(link) || imported.current === link) return;
    imported.current = link;
    setBusy("import");
    setMsg("Reading the page…");
    try {
      const r = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link, html }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't read that page.");
      setName((v) => v || d.name || "");
      setStore((v) => v || d.store || "");
      setPrice((v) => v || (d.price != null ? String(d.price) : ""));
      setPicks(d.images || []);
      setPhoto((p) => (p.kind === "none" && d.images?.length ? { kind: "remote", url: d.images[0] } : p));
      setBlocked(!!d.blocked);
      setMsg(d.warning || (d.images?.length ? `Found ${d.images.length} photo${d.images.length === 1 ? "" : "s"}. Choose one.` : "No photos found. Paste or drop one."));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't read that page.");
    } finally {
      setBusy("");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMsg("Give it a name.");
      return;
    }
    setBusy("save");
    setMsg("Saving…");
    try {
      let image_url: string | null = null, image_path: string | null = null;
      if (photo.kind === "existing") ({ url: image_url, path: image_path } = photo);
      if (photo.kind === "remote") {
        const r = await fetch("/api/image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ src: photo.url }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "The photo couldn't be saved.");
        image_url = d.url;
        image_path = d.path;
      }
      if (photo.kind === "file") {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error("Please sign in again.");
        const blob = await shrink(photo.file);
        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from("things").upload(path, blob, { contentType: blob.type || "image/jpeg" });
        if (error) throw error;
        image_url = sb.storage.from("things").getPublicUrl(path).data.publicUrl;
        image_path = path;
      }
      const p = price.replace(/[^0-9.]/g, "");
      const framed = image_url ? { image_x: Math.round(fx * 10) / 10, image_y: Math.round(fy * 10) / 10, image_zoom: Math.round(fz * 100) / 100 } : { image_x: null, image_y: null, image_zoom: null };
      await onSave({
        id: thing?.id,
        name: name.trim(),
        url: url.trim() || null,
        store: store.trim() || null,
        price: p ? Number(p) : null,
        currency: "USD",
        board: board.trim() || null,
        note: note.trim() || null,
        image_url,
        image_path,
        ...framed,
      });
    } catch (err) {
      // Database errors arrive as plain objects with a message, not as Error.
      const m = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
      setMsg(m ? `Couldn't save: ${m}` : "Couldn't save. Try again.");
      setBusy("");
    }
  }

  const preview = photo.kind === "file" ? photo.preview : photo.kind === "none" ? "" : photo.url;

  // A different photo starts centered again; the photo it opened with keeps its framing.
  useEffect(() => {
    if (firstPreview.current === null) {
      firstPreview.current = preview;
      return;
    }
    setFx(50);
    setFy(50);
    setFz(1);
  }, [preview]);

  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!preview || e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, fx, fy, w: r.width, h: r.height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    // Dragging the photo right shows more of its left side, like moving a print under a mat.
    setFx(clamp(d.fx - (dx / d.w) * 100 / fz));
    setFy(clamp(d.fy - (dy / d.h) * 100 / fz));
  }
  function endDrag() {
    drag.current = null;
  }
  function nudge(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 10 : 2;
    const k: Record<string, () => void> = {
      ArrowLeft: () => setFx((v) => clamp(v + step)),
      ArrowRight: () => setFx((v) => clamp(v - step)),
      ArrowUp: () => setFy((v) => clamp(v + step)),
      ArrowDown: () => setFy((v) => clamp(v - step)),
      "+": () => setFz((v) => Math.min(3, v + 0.1)),
      "=": () => setFz((v) => Math.min(3, v + 0.1)),
      "-": () => setFz((v) => Math.max(1, v - 0.1)),
    };
    if (k[e.key]) {
      e.preventDefault();
      k[e.key]();
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="dlgtitle">
      <form className="form" onSubmit={submit}>
        <h2 id="dlgtitle">{thing ? "Edit thing" : "Add a thing"}</h2>
        <div>
          <div
            className={`drop${over ? " over" : ""}${preview ? " framed" : ""}`}
            tabIndex={0}
            role={preview ? "group" : "button"}
            aria-label={preview ? "Photo framing. Drag to move the photo, or use the arrow keys. Plus and minus zoom." : "Choose a photo"}
            onClick={() => !preview && fileRef.current?.click()}
            onKeyDown={(e) => {
              if (preview) return nudge(e);
              if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
            }}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOver(false);
              const f = e.dataTransfer.files[0];
              if (f) takeFile(f);
            }}
          >
            <span>Paste a link to find photos, or drop, paste, or choose an image.</span>
            {preview && <img src={preview} alt="" referrerPolicy="no-referrer" draggable={false} style={frameStyle({ image_x: fx, image_y: fy, image_zoom: fz })} />}
          </div>
          {preview && (
            <div className="frame-tools">
              <label className="zoom">
                <span>Zoom</span>
                <input type="range" min={1} max={3} step={0.01} value={fz} onChange={(e) => setFz(Number(e.target.value))} />
              </label>
              <button type="button" className="lk" onClick={() => { setFx(50); setFy(50); setFz(1); }}>
                Center
              </button>
              <button type="button" className="lk" onClick={() => fileRef.current?.click()}>
                Replace photo
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && takeFile(e.target.files[0])} />
          {picks.length > 0 && (
            <div className="picks" role="group" aria-label="Photos from the page">
              {picks.map((p) => (
                <button type="button" key={p} aria-pressed={photo.kind === "remote" && photo.url === p} onClick={() => setPhoto({ kind: "remote", url: p })}>
                  <img src={p} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = "none")} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="fields">
          <label>
            Link
            <input
              type="url"
              placeholder="https://"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (!store) setStore(host(e.target.value));
              }}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text").trim();
                if (/^https?:\/\//i.test(t)) setTimeout(() => doImport(t), 0);
              }}
              onBlur={() => doImport(url)}
              autoFocus={!pre?.url && !thing}
            />
          </label>
          <label>
            Name
            <input required placeholder="What is it?" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="two">
            <label>
              Store
              <input value={store} onChange={(e) => setStore(e.target.value)} />
            </label>
            <label>
              Price
              <input inputMode="decimal" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
          </div>
          <label>
            Board
            <input list="boardlist" placeholder="Home, Wear, Studio…" value={board} onChange={(e) => setBoard(e.target.value)} />
          </label>
          <datalist id="boardlist">
            {boards.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <label>
            Note
            <textarea placeholder="Size, color, why you want it" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row">
            <button className="btn" disabled={busy !== ""}>{busy === "save" ? "Saving…" : "Save"}</button>
            <button className="btn ghost" type="button" onClick={() => ref.current?.close()}>
              Cancel
            </button>
            {onDelete && (
              <button className="btn ghost del" type="button" onClick={onDelete}>
                Delete
              </button>
            )}
          </div>
          <p className="hint" role="status">
            {busy === "import" ? "Reading the page…" : msg}
            {blocked && busy !== "import" && (
              <>
                {" "}
                <a href="/save-button" target="_blank" rel="noopener">Get the Save button</a>
              </>
            )}
          </p>
        </div>
      </form>
    </dialog>
  );
}

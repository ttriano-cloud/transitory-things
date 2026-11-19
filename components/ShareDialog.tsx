"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Your share link: anyone who has it can look at your things, but not change them.
export default function ShareDialog({ sb, board, onClose, say }: { sb: SupabaseClient; board: string; onClose: () => void; say: (msg: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "load" | "new" | "off">("load");
  const [msg, setMsg] = useState("");
  const [onBoard, setOnBoard] = useState(board !== "All");

  useEffect(() => {
    ref.current?.showModal();
    (async () => {
      const { data, error } = await sb.rpc("my_share_token", { fresh: false });
      setBusy("");
      if (error) return setMsg("Couldn't make a link. Run the latest lines in supabase/schema.sql in Supabase.");
      setToken(data as string);
    })();
  }, [sb]);

  const link = token ? `${location.origin}/s/${token}${onBoard && board !== "All" ? `?board=${encodeURIComponent(board)}` : ""}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      say("Link copied.");
      ref.current?.close();
    } catch {
      setMsg("Select the link and copy it.");
    }
  }
  async function renew() {
    setBusy("new");
    const { data, error } = await sb.rpc("my_share_token", { fresh: true });
    setBusy("");
    if (error) return setMsg("Couldn't make a new link.");
    setToken(data as string);
    setMsg("New link made. The old one no longer works.");
  }
  async function stop() {
    if (!token) return;
    setBusy("off");
    const { error } = await sb.from("shares").delete().eq("token", token);
    setBusy("");
    if (error) return setMsg("Couldn't turn sharing off.");
    say("Sharing is off. Your old link no longer works.");
    ref.current?.close();
  }

  return (
    <dialog ref={ref} className="share" onClose={onClose} onCancel={onClose} aria-labelledby="sharetitle">
      <div className="form">
        <h2 id="sharetitle">Share your things</h2>
        <p className="hint">Anyone with this link can see your things. They can&rsquo;t change anything, and your notes stay private.</p>
        <input className="sharelink" readOnly value={busy === "load" ? "Making your link…" : link} onFocus={(e) => e.target.select()} aria-label="Your share link" />
        {board !== "All" && (
          <label className="check">
            <input type="checkbox" checked={onBoard} onChange={(e) => setOnBoard(e.target.checked)} />
            Open on the {board} board
          </label>
        )}
        <div className="row">
          <button className="btn" onClick={copy} disabled={!token || busy !== ""}>Copy link</button>
          <button className="btn ghost" onClick={() => ref.current?.close()}>Done</button>
        </div>
        <div className="row small">
          <button className="lk" onClick={renew} disabled={!token || busy !== ""}>{busy === "new" ? "Making…" : "Make a new link"}</button>
          <button className="lk" onClick={stop} disabled={!token || busy !== ""}>{busy === "off" ? "Turning off…" : "Stop sharing"}</button>
        </div>
        <p className="hint" role="status">{msg}</p>
      </div>
    </dialog>
  );
}

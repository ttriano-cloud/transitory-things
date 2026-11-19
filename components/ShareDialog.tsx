"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HANDLE_RE, HOME_URL, pageUrl } from "@/lib/site";

type Busy = "" | "load" | "name" | "unname" | "link" | "renew" | "off";

// Two ways to share, both look-only: your name page (yourname.transitorythings.com),
// which anyone can find, and a private link that only works for people you send it to.
export default function ShareDialog({ sb, board, onClose, say }: { sb: SupabaseClient; board: string; onClose: () => void; say: (msg: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>("load");
  const [nameMsg, setNameMsg] = useState("");
  const [linkMsg, setLinkMsg] = useState("");
  const [onBoard, setOnBoard] = useState(board !== "All");

  useEffect(() => {
    ref.current?.showModal();
    (async () => {
      const [p, s] = await Promise.all([
        sb.from("profiles").select("handle").maybeSingle(),
        sb.from("shares").select("token").maybeSingle(),
      ]);
      setBusy("");
      if (p.error || s.error) return setNameMsg("Sharing isn't set up yet. Run the latest lines in supabase/schema.sql in Supabase.");
      setHandle(p.data?.handle ?? null);
      setDraft(p.data?.handle ?? "");
      setToken(s.data?.token ?? null);
    })();
  }, [sb]);

  const q = onBoard && board !== "All" ? `?board=${encodeURIComponent(board)}` : "";
  const nameLink = handle ? pageUrl(handle) + (q ? `/${q}` : "") : "";
  const privateLink = token ? `${HOME_URL}/s/${token}${q}` : "";
  const clean = draft.trim().toLowerCase();
  const draftOk = HANDLE_RE.test(clean) && !clean.includes("--");

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      say("Link copied.");
      ref.current?.close();
    } catch {
      say("Select the link and copy it.");
    }
  }
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!draftOk) return setNameMsg("Use 3 to 30 letters, numbers, or single hyphens (not at the start or end).");
    setBusy("name");
    const { data, error } = await sb.rpc("set_my_handle", { new_handle: clean });
    setBusy("");
    if (error) return setNameMsg(error.message || "Couldn't save that name.");
    setHandle(data as string);
    setNameMsg(handle ? "Name changed. Your old address no longer works." : "Your page is live.");
  }
  async function removeName() {
    setBusy("unname");
    const { error } = await sb.rpc("set_my_handle", { new_handle: "" });
    setBusy("");
    if (error) return setNameMsg("Couldn't turn your page off.");
    setHandle(null);
    setDraft("");
    setNameMsg("Your page is off.");
  }
  async function makeLink(fresh: boolean) {
    setBusy(fresh ? "renew" : "link");
    const { data, error } = await sb.rpc("my_share_token", { fresh });
    setBusy("");
    if (error) return setLinkMsg("Couldn't make a link.");
    setToken(data as string);
    setLinkMsg(fresh ? "New link made. The old one no longer works." : "");
  }
  async function stopLink() {
    if (!token) return;
    setBusy("off");
    const { error } = await sb.from("shares").delete().eq("token", token);
    setBusy("");
    if (error) return setLinkMsg("Couldn't turn the link off.");
    setToken(null);
    setLinkMsg("Private link is off.");
  }

  const idle = busy === "";
  return (
    <dialog ref={ref} className="share" onClose={onClose} onCancel={onClose} aria-labelledby="sharetitle">
      <div className="form">
        <h2 id="sharetitle">Share your things</h2>
        <p className="hint">People you share with can look but not change anything. Your notes stay private.</p>

        <section className="sharepart" aria-labelledby="namehead">
          <h3 id="namehead">Your page</h3>
          <p className="hint">An address with your name. Anyone who knows or guesses it can see your things.</p>
          <form className="namerow" onSubmit={saveName}>
            <input
              className="sharelink"
              aria-label="Your name"
              placeholder="yourname"
              value={draft}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => { setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setNameMsg(""); }}
              disabled={busy === "load"}
            />
            <span className="suffix">.transitorythings.com</span>
            <button className="btn" disabled={!idle || !draftOk || clean === handle}>{busy === "name" ? "Saving…" : handle ? "Change" : "Claim"}</button>
          </form>
          {handle && (
            <div className="row small">
              <button className="lk" onClick={() => copy(nameLink)} disabled={!idle}>Copy {nameLink.replace(/^https?:\/\//, "")}</button>
              <a className="lk" href={nameLink} target="_blank" rel="noopener">Open ↗</a>
              <button className="lk" onClick={removeName} disabled={!idle}>{busy === "unname" ? "Turning off…" : "Turn off"}</button>
            </div>
          )}
          <p className="hint" role="status">{nameMsg}</p>
        </section>

        <section className="sharepart" aria-labelledby="linkhead">
          <h3 id="linkhead">Private link</h3>
          <p className="hint">A random link that can&rsquo;t be guessed. Only people you send it to can see your things.</p>
          {token ? (
            <>
              <input className="sharelink" readOnly value={privateLink} onFocus={(e) => e.target.select()} aria-label="Your private link" />
              <div className="row small">
                <button className="lk" onClick={() => copy(privateLink)} disabled={!idle}>Copy link</button>
                <button className="lk" onClick={() => makeLink(true)} disabled={!idle}>{busy === "renew" ? "Making…" : "Make a new link"}</button>
                <button className="lk" onClick={stopLink} disabled={!idle}>{busy === "off" ? "Turning off…" : "Turn off"}</button>
              </div>
            </>
          ) : (
            <div className="row">
              <button className="btn ghost" onClick={() => makeLink(false)} disabled={!idle}>{busy === "link" ? "Making…" : "Make a private link"}</button>
            </div>
          )}
          <p className="hint" role="status">{linkMsg}</p>
        </section>

        {board !== "All" && (handle || token) && (
          <label className="check">
            <input type="checkbox" checked={onBoard} onChange={(e) => setOnBoard(e.target.checked)} />
            Links open on the {board} board
          </label>
        )}
        <div className="row">
          <button className="btn ghost" onClick={() => ref.current?.close()}>Done</button>
        </div>
      </div>
    </dialog>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AddDialog, { type Draft } from "@/components/AddDialog";

type State =
  | { s: "loading" }
  | { s: "signin" }
  | { s: "ready"; url: string; html?: string; boards: string[] }
  | { s: "saved" }
  | { s: "nothing" };

// The window the Save button opens. It receives a copy of the shop's page from the
// bookmark, then shows the usual "Add a thing" form already filled in.
export default function Clip() {
  const sb = useMemo(() => createClient(), []);
  const params = useSearchParams();
  const [state, setState] = useState<State>({ s: "loading" });

  useEffect(() => {
    let done = false;
    let boards: string[] = [];
    const fallbackUrl = params.get("u") || "";
    // Opened by the Chrome extension (which hands the page over inside this window)
    // or by the bookmark (which hands it over from the shop's window).
    const fromExtension = params.get("ext") === "1";

    const finish = (url: string, html?: string) => {
      if (done) return;
      done = true;
      clearInterval(ping);
      clearTimeout(giveUp);
      removeEventListener("message", onMessage);
      if (!/^https?:\/\//i.test(url)) return setState({ s: "nothing" });
      setState({ s: "ready", url, html, boards });
    };

    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.tt !== "page" || typeof d.url !== "string" || typeof d.html !== "string") return;
      if (fromExtension && d.ext === true) {
        if (e.source !== window || e.origin !== location.origin) return;
      } else {
        if (e.source !== window.opener) return;
        // The page copy must come from the shop it claims to be.
        try {
          if (new URL(d.url).origin !== e.origin) return;
        } catch {
          return;
        }
      }
      finish(d.url, d.html);
    };

    // Tell the shop's page we're ready, a few times in case it's slow.
    const hello = () => {
      try {
        if (fromExtension) window.postMessage({ tt: "ready" }, location.origin);
        else window.opener?.postMessage({ tt: "ready" }, "*");
      } catch {}
    };
    let ping: ReturnType<typeof setInterval> | undefined;
    let giveUp: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return setState({ s: "signin" });
      const { data } = await sb.from("things").select("board");
      boards = [...new Set((data || []).map((x: { board: string | null }) => x.board).filter(Boolean) as string[])].sort();
      addEventListener("message", onMessage);
      hello();
      ping = setInterval(hello, 250);
      // Some shops cut the link to this window; then read the page the usual way.
      giveUp = setTimeout(() => finish(fallbackUrl), fromExtension ? 6000 : 2500);
    })();

    return () => {
      done = true;
      clearInterval(ping);
      clearTimeout(giveUp);
      removeEventListener("message", onMessage);
    };
  }, [sb, params]);

  async function save(d: Draft) {
    const { id: _id, ...fields } = d;
    const { error } = await sb.from("things").insert(fields);
    if (error) throw error;
    setState({ s: "saved" });
    setTimeout(() => window.close(), 1200);
  }

  if (state.s === "ready") {
    return (
      <main className="clip">
        <AddDialog pre={{ url: state.url, html: state.html }} boards={state.boards} defaultBoard="" onClose={() => window.close()} onSave={save} />
      </main>
    );
  }
  return (
    <main className="page">
      <div>
        <h1>
          Transitory <span>Things</span>
        </h1>
        {state.s === "loading" && <p>Reading the page…</p>}
        {state.s === "saved" && <p>Added to your things.</p>}
        {state.s === "nothing" && <p>Open a product page in a shop, then click the Save button.</p>}
        {state.s === "signin" && (
          <p>
            You're signed out. <a href="/login" target="_blank" rel="noopener">Sign in</a>, then click the Save button again.
          </p>
        )}
      </div>
    </main>
  );
}

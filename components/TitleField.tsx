"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// The title at the top of your page. Empty goes back to "<Name>'s Things".
export default function TitleField({ initial, placeholder }: { initial: string; placeholder: string }) {
  const sb = useMemo(() => createClient(), []);
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [note, setNote] = useState("");

  async function save() {
    const v = value.trim().slice(0, 60);
    if (v === saved) return;
    setNote("Saving…");
    const { error } = await sb.auth.updateUser({ data: { page_title: v } });
    if (error) return setNote("Couldn't save that.");
    setSaved(v);
    setValue(v);
    setNote("Saved.");
    setTimeout(() => setNote(""), 2000);
  }

  return (
    <form className="titlefield" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <input aria-label="Title at the top of your page" value={value} placeholder={placeholder} maxLength={60} onChange={(e) => setValue(e.target.value)} onBlur={save} />
      <span className="hint" aria-live="polite">{note}</span>
    </form>
  );
}

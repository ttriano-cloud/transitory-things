import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Gallery, { type Thing } from "@/components/Gallery";
import { titleFor } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data }, { data: profile }] = await Promise.all([
    supabase.from("things").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("handle").eq("user_id", user.id).maybeSingle(),
  ]);
  const items = ((data as (Thing & { found_by?: string | null })[]) || []);
  // Who first found the things you saved from other people.
  const finders = [...new Set(items.map((x) => x.found_by).filter(Boolean))] as string[];
  if (finders.length) {
    const { data: names } = await supabase.rpc("handles_of", { ids: finders });
    const byId = new Map(((names as { user_id: string; handle: string }[]) || []).map((n) => [n.user_id, n.handle]));
    items.forEach((x) => (x.found_by_handle = x.found_by ? byId.get(x.found_by) || null : null));
  }
  // The title at the top: your own (set in Settings), or "<Name>'s Things".
  const m = user.user_metadata || {};
  const name = String(m.first_name || m.full_name || m.name || "").trim().split(/\s+/)[0] || profile?.handle || (user.email || "").split("@")[0];
  return <Gallery initial={items} email={user.email || ""} title={titleFor(m.page_title, name)} ownerHandle={profile?.handle || undefined} />;
}

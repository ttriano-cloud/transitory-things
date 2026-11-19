import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Gallery, { type Thing } from "@/components/Gallery";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data }, { data: profile }] = await Promise.all([
    supabase.from("things").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("handle").eq("user_id", user.id).maybeSingle(),
  ]);
  // The name shown at the top: your own name if you gave one, else your page name, else your email.
  const m = user.user_metadata || {};
  const name = String(m.first_name || m.full_name || m.name || "").trim().split(/\s+/)[0] || profile?.handle || (user.email || "").split("@")[0];
  return <Gallery initial={(data as Thing[]) || []} email={user.email || ""} owner={name} />;
}

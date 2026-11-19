import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Gallery, { type Thing } from "@/components/Gallery";

export const metadata: Metadata = { title: "Community · Transitory Things" };
export const dynamic = "force-dynamic";

// Everything people keep on their public name pages, newest first.
export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data, error }, { data: profile }] = await Promise.all([
    supabase.rpc("community_things", { lim: 300 }),
    supabase.from("profiles").select("handle").eq("user_id", user.id).maybeSingle(),
  ]);
  const items = error ? [] : ((data as Omit<Thing, "note" | "image_path" | "is_public">[]) || []).map((x) => ({ ...x, note: null, image_path: null, is_public: true }) as Thing);
  return <Gallery initial={items} shared community title="Community" viewerHandle={profile?.handle || undefined} signedIn />;
}

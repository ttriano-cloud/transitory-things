import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Gallery, { type Thing } from "@/components/Gallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transitory Things",
  description: "A quiet place to keep the things you want, for now.",
  robots: { index: false, follow: false },
};

// Someone's things, seen through their share link. Read-only.
export default async function Shared({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ board?: string }> }) {
  const { token } = await params;
  const { board } = await searchParams;
  if (!/^[a-z0-9]{6,64}$/.test(token)) notFound();
  const supabase = await createClient();
  const [{ data, error }, { data: { user } }] = await Promise.all([
    supabase.rpc("shared_things", { share_token: token }),
    supabase.auth.getUser(),
  ]);
  if (error || !data?.length) notFound();
  const items = (data as Omit<Thing, "note" | "image_path" | "is_public">[]).map((x) => ({ ...x, note: null, image_path: null, is_public: true }) as Thing);
  return <Gallery initial={items} shared initialBoard={typeof board === "string" ? board : undefined} signedIn={!!user} />;
}

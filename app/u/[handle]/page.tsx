import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Gallery, { type Thing } from "@/components/Gallery";
import { HANDLE_RE, HOME_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `${handle} · Transitory Things`, description: "Things I want, for now." };
}

// Someone's page at <name>.transitorythings.com. Read-only.
export default async function NamePage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ board?: string }> }) {
  const { handle } = await params;
  const { board } = await searchParams;
  const h = handle.toLowerCase();
  if (!HANDLE_RE.test(h)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("handle_things", { page_handle: h });
  if (error || !data?.length) notFound();
  const items = (data as Omit<Thing, "note" | "image_path" | "is_public">[]).map((x) => ({ ...x, note: null, image_path: null, is_public: true }) as Thing);
  return <Gallery initial={items} shared owner={h} home={HOME_URL} initialBoard={typeof board === "string" ? board : undefined} />;
}

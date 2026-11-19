import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeFetch } from "@/lib/safe-fetch";

export const runtime = "nodejs";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

// POST { src } -> copies a product photo into your own storage, so it stays even if the shop removes it.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let src = "";
  try {
    src = String((await req.json()).src || "");
    new URL(src);
  } catch {
    return NextResponse.json({ error: "Missing photo link." }, { status: 400 });
  }

  try {
    const img = await safeFetch(src, { accept: "image/avif,image/webp,image/jpeg,image/png,image/*", maxBytes: 12_000_000 });
    const type = img.type.split(";")[0].trim().toLowerCase();
    const ext = EXT[type];
    if (!ext) return NextResponse.json({ error: "That link isn't a photo we can save." }, { status: 415 });
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("things").upload(path, img.body, { contentType: type, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from("things").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl, path });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The photo couldn't be saved." }, { status: 502 });
  }
}

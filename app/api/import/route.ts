import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractProduct, nameFromUrl } from "@/lib/extract";
import { safeFetch } from "@/lib/safe-fetch";

export const runtime = "nodejs";

// POST { url } -> { name, price, currency, store, images[], url }
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let link = "";
  try {
    link = String((await req.json()).url || "").trim();
    new URL(link);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a link." }, { status: 400 });
  }

  let result = null as ReturnType<typeof extractProduct> | null;
  let problem = "";
  try {
    const page = await safeFetch(link, { accept: "text/html,application/xhtml+xml", maxBytes: 4_000_000 });
    result = extractProduct(page.body.toString("utf8"), page.url);
  } catch (e) {
    problem = e instanceof Error ? e.message : "The page couldn't be read.";
  }

  // Shops that block ordinary visits: optionally ask Microlink to read the page instead.
  const key = process.env.MICROLINK_API_KEY;
  if (key && (!result || result.images.length === 0)) {
    try {
      const r = await fetch(`https://pro.microlink.io/?url=${encodeURIComponent(link)}&palette=false&audio=false&video=false`, {
        headers: { "x-api-key": key },
      });
      const j = await r.json();
      if (j.status === "success") {
        const d = j.data || {};
        result = {
          name: result?.name || d.title || "",
          price: result?.price ?? null,
          currency: result?.currency ?? null,
          store: result?.store || d.publisher || new URL(link).hostname.replace(/^www\./, ""),
          images: [d.image?.url, d.logo?.url && null].filter(Boolean) as string[],
          url: link,
        };
      }
    } catch {
      /* fall through to the basic result */
    }
  }

  if (!result) {
    return NextResponse.json({
      name: nameFromUrl(link),
      price: null,
      currency: null,
      store: new URL(link).hostname.replace(/^www\./, ""),
      images: [],
      url: link,
      warning: `${problem} You can still paste or drop a photo yourself.`,
    });
  }
  if (!result.name) result.name = nameFromUrl(link);
  return NextResponse.json(result);
}

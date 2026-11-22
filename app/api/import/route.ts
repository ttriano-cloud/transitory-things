import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { biggerPhoto, extractProduct, looksBlocked, nameFromUrl, parsePrice, photoKey, type Extracted } from "@/lib/extract";
import { tidyDetails, type Facts } from "@/lib/details";
import { safeFetch } from "@/lib/safe-fetch";

export const runtime = "nodejs";

const MAX_HTML = 3_500_000;

// Shopify shops answer /products/<handle>.js with the product as JSON, prices in cents.
// Often works even when the page itself is blocked.
async function fromShopify(link: string): Promise<Partial<Extracted> | null> {
  const u = new URL(link);
  const m = u.pathname.match(/^(.*\/products\/[^/?#]+?)\/?$/);
  if (!m) return null;
  try {
    const res = await safeFetch(`${u.origin}${m[1].replace(/\.(js|json)$/, "")}.js`, { accept: "application/json", maxBytes: 2_000_000, timeoutMs: 6000 });
    const j = JSON.parse(res.body.toString("utf8"));
    if (!j || typeof j.title !== "string") return null;
    const variantId = u.searchParams.get("variant");
    const v = (j.variants || []).find((x: any) => String(x.id) === variantId) || (j.variants || [])[0];
    const cents = v?.price ?? j.price;
    return {
      name: j.title,
      price: typeof cents === "number" && cents > 0 ? cents / 100 : null,
      store: j.vendor || "",
      images: (j.images || []).map((s: string) => (s.startsWith("//") ? `https:${s}` : s)),
    };
  } catch {
    return null;
  }
}

// POST { url, html? } -> { name, price, currency, store, images[], url }
// html is sent by the save button, which reads the page in the person's own browser.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let link = "";
  let html = "";
  let facts: Facts = {};
  try {
    const body = await req.json();
    link = String(body.url || "").trim();
    html = typeof body.html === "string" ? body.html.slice(0, MAX_HTML) : "";
    if (body.facts && typeof body.facts === "object") facts = body.facts;
    const u = new URL(link);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
  } catch {
    return NextResponse.json({ error: "That doesn't look like a link." }, { status: 400 });
  }
  const ownHost = new URL(req.url).hostname.replace(/^www\./, "");
  const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "");
  if (hostOf(link) === ownHost) {
    return NextResponse.json({ error: "That's a link to Transitory Things itself. Paste the shop's product link instead." }, { status: 400 });
  }

  let result: Extracted | null = null;
  let problem = "";
  if (html) {
    result = extractProduct(html, link);
  } else {
    try {
      const page = await safeFetch(link, { accept: "text/html,application/xhtml+xml", maxBytes: 4_000_000 });
      const text = page.body.toString("utf8");
      if (hostOf(page.url) === ownHost) problem = "That link led back to Transitory Things.";
      else if (looksBlocked(text)) problem = "The shop showed a bot check instead of the product.";
      else result = extractProduct(text, page.url);
    } catch (e) {
      problem = e instanceof Error ? e.message : "The page couldn't be read.";
    }
  }

  // Fill gaps from Shopify's product data when the link looks like a Shopify product.
  if (!result || result.price == null || result.images.length === 0) {
    const s = await fromShopify(link);
    if (s) {
      result = {
        name: result?.name || s.name || "",
        price: result?.price ?? s.price ?? null,
        currency: result?.currency || (s.price != null ? "USD" : null),
        store: result?.store || s.store || hostOf(link),
        images: result?.images.length ? result.images : s.images || [],
        url: link,
      };
    }
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
          store: result?.store || d.publisher || hostOf(link),
          images: [d.image?.url].filter(Boolean) as string[],
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
      store: hostOf(link),
      images: [],
      url: link,
      blocked: true,
      warning: `${problem} Use the Save button on the shop's page to bring in the name, price, and photos.`,
    });
  }
  if (!result.name) result.name = nameFromUrl(link);
  return NextResponse.json(withFacts(result, facts));
}

// Adds what the extension saw on the live page: the options picked, the photo being looked at,
// and the price on screen when the page's own data had none.
function withFacts(r: Extracted, f: Facts): Extracted {
  const details = { ...(r.details || {}) };
  const sel = f.selected && typeof f.selected === "object" ? f.selected : {};
  for (const [k, v] of Object.entries(sel)) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (/size|taille|größe/i.test(k)) details.size = v;
    else if (/colou?r|shade|finish/i.test(k)) details.color = v;
  }
  // The photo on screen first, then the page's full gallery, then whatever else the copy had.
  const ok = (u: unknown): u is string => typeof u === "string" && u.length < 2000 && /^https:\/\//i.test(u);
  const live = [f.hero, ...(Array.isArray(f.images) ? f.images.slice(0, 40) : [])].filter(ok).map(biggerPhoto);
  const seen = new Set<string>();
  const images = [...live, ...r.images].filter((u) => {
    const k = photoKey(u);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 30);
  const price = r.price ?? (typeof f.price === "string" ? parsePrice(f.price) : null);
  return { ...r, price, images, details: tidyDetails(details) || undefined };
}

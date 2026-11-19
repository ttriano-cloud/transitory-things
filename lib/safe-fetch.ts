import { lookup } from "node:dns/promises";
import net from "node:net";

// Fetches a public web page or image for the import feature, refusing anything on a
// private network (so the server can't be tricked into reading internal addresses).

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

function isPrivate(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function assertPublic(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only web links can be imported.");
  if (u.username || u.password) throw new Error("Links with passwords can't be imported.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new Error("That address can't be reached.");
}

export async function safeFetch(
  raw: string,
  opts: { accept: string; maxBytes: number; timeoutMs?: number }
): Promise<{ url: string; type: string; body: Buffer }> {
  let url = new URL(raw);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);
  try {
    for (let hop = 0; hop < 5; hop++) {
      await assertPublic(url);
      const res = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": UA, accept: opts.accept, "accept-language": "en-US,en;q=0.9" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (!res.ok) throw new Error(`The shop answered with an error (${res.status}).`);
      const len = Number(res.headers.get("content-length") || 0);
      if (len > opts.maxBytes) throw new Error("That file is too large.");
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > opts.maxBytes) {
            ctrl.abort();
            throw new Error("That file is too large.");
          }
          chunks.push(value);
        }
      }
      return { url: url.toString(), type: res.headers.get("content-type") || "", body: Buffer.concat(chunks) };
    }
    throw new Error("Too many redirects.");
  } finally {
    clearTimeout(timer);
  }
}

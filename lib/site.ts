// The main address. Name pages live one level below it: <name>.transitorythings.com.
// Set NEXT_PUBLIC_ROOT_DOMAIN to change it (for local testing, "localhost:3000" makes <name>.localhost:3000 work).
export const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "transitorythings.com").toLowerCase();
export const HOME_URL = ROOT_DOMAIN.startsWith("localhost") ? `http://${ROOT_DOMAIN}` : `https://${ROOT_DOMAIN}`;

export const HANDLE_RE = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$/;

// The name in an address like trevor.transitorythings.com, or null for the main site.
export function handleFromHost(host: string | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase();
  if (!h.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const sub = h.slice(0, -ROOT_DOMAIN.length - 1);
  if (sub === "www" || !HANDLE_RE.test(sub) || sub.includes("--")) return null;
  return sub;
}

export const pageUrl = (handle: string) => `${HOME_URL.split("//")[0]}//${handle}.${ROOT_DOMAIN}`;

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { HOME_URL, handleFromHost } from "@/lib/site";

// Keeps the login session fresh on every page load.
export async function middleware(request: NextRequest) {
  // trevor.transitorythings.com shows Trevor's page. Anything else there goes to the main site.
  const handle = handleFromHost(request.headers.get("host"));
  if (handle) {
    const { pathname, search } = request.nextUrl;
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = `/u/${handle}`;
      return NextResponse.rewrite(url);
    }
    // Written out by hand so the address always points at the main site.
    return new NextResponse(null, { status: 307, headers: { Location: new URL(pathname + search, HOME_URL).toString() } });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

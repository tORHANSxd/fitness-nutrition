import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

const publicRoutes = ["/login", "/auth/callback"];

export async function proxy(request: NextRequest) {
  const { authenticated, response } = await refreshSupabaseSession(request);
  const { pathname, search } = request.nextUrl;
  const isPublic = publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (!authenticated && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && pathname === "/login") {
    const nextPath = request.nextUrl.searchParams.get("next");
    const safeNextPath = nextPath?.startsWith("/") && !nextPath.startsWith("//") && !nextPath.startsWith("/\\")
      ? nextPath
      : "/overview";
    const destination = request.nextUrl.clone();
    destination.pathname = safeNextPath.split("?")[0];
    destination.search = safeNextPath.includes("?") ? `?${safeNextPath.split("?").slice(1).join("?")}` : "";
    return NextResponse.redirect(destination);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};

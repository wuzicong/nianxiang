import { isThemeId } from "@memora/shared";
import { NextResponse, type NextRequest } from "next/server";
import { SHARE_THEME_HEADER } from "./lib/share-theme-header";

const SESSION_COOKIE = "memora_session";
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const token = request.cookies.get(SESSION_COOKIE)?.value ?? "";
    if (SESSION_TOKEN.test(token)) {
      return NextResponse.redirect(new URL("/library", request.url));
    }
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  const hinted = request.nextUrl.searchParams.get("t");
  if (hinted && isThemeId(hinted)) {
    requestHeaders.set(SHARE_THEME_HEADER, hinted);
  } else {
    requestHeaders.delete(SHARE_THEME_HEADER);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/", "/s/:path*"],
};

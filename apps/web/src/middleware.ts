import { isThemeId } from "@memora/shared";
import { NextResponse, type NextRequest } from "next/server";
import { SHARE_THEME_HEADER } from "./lib/share-theme-header";

export function middleware(request: NextRequest) {
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
  matcher: "/s/:path*",
};

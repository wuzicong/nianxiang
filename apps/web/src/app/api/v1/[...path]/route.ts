import { NextResponse, type NextRequest } from "next/server";
import { applyProxyResponseHeaders } from "@/lib/api-proxy";
import { apiOrigin } from "@/lib/api-origin";

export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const target = `${apiOrigin()}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json(
      { error: "api_unavailable", message: "API 暂时不可达" },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  applyProxyResponseHeaders(responseHeaders, upstream.headers);
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status, headers: responseHeaders });
  }
  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxy(request, path);
}

export const GET = handle;
export const POST = handle;

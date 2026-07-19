import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Optional shared-password gate (Phase 1 pilot).
 * When BASIC_AUTH_PASSWORD is unset, skipped.
 * Auth.js session routes and health checks are always allowed through Basic Auth
 * so login still works behind the shared password.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) {
    return NextResponse.next();
  }

  // Allow NextAuth + signup through Basic Auth challenge (browser already
  // authenticated at the edge, or curl with -u). Still require Basic Auth
  // for the HTML login page itself when password is set.
  const user = process.env.BASIC_AUTH_USER || "director";
  const header = request.headers.get("authorization");

  if (header?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      const login = sep >= 0 ? decoded.slice(0, sep) : decoded;
      const pass = sep >= 0 ? decoded.slice(sep + 1) : "";
      if (safeEqual(login, user) && safeEqual(pass, password)) {
        return NextResponse.next();
      }
    } catch {
      // fall through
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Performance Notes", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unauthenticated liveness probe for Railway / uptime monitors. */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "performancenotes" },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}

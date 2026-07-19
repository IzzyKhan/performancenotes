import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createId, nowIso } from "@/lib/id";
import { authRequired } from "@/lib/auth-guard";
import { seedDemoForUser } from "@/lib/seed";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authRequired()) {
    return NextResponse.json(
      { error: "Set AUTH_SECRET to enable signup" },
      { status: 400 }
    );
  }

  if (process.env.ALLOW_SIGNUP === "false") {
    return NextResponse.json(
      { error: "Signup is disabled" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 }
    );
  }

  const id = createId("user");
  const passwordHash = await hash(password, 10);
  db.insert(users)
    .values({
      id,
      email,
      passwordHash,
      createdAt: nowIso(),
      plan: "prep",
      chatUsageCount: 0,
    })
    .run();

  seedDemoForUser(id);

  return NextResponse.json({ id, email }, { status: 201 });
}

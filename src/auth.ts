import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Production (Railway) crashes some routes if secret is missing — fall back so
  // Basic Auth–only pilots still work. Set AUTH_SECRET for real account sessions.
  secret:
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "production"
      ? "performancenotes-set-AUTH_SECRET-in-railway"
      : "dev-secret"),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const row = db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .get();
        if (!row) return null;

        const ok = await compare(password, row.passwordHash);
        if (!ok) return null;

        return { id: row.id, email: row.email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        if (user.email) token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        session.user.email =
          typeof token.email === "string" ? token.email : session.user.email;
      }
      return session;
    },
  },
  trustHost: true,
});

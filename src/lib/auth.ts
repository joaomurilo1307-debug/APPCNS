import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const loginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil: number | null }>();

function isLocked(email: string): boolean {
  const entry = loginAttempts.get(email);
  if (!entry) return false;
  const now = Date.now();
  if (entry.lockedUntil) {
    if (now < entry.lockedUntil) return true;
    loginAttempts.delete(email);
    return false;
  }
  if (now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.delete(email);
    return false;
  }
  return false;
}

function recordFailure(email: string) {
  const now = Date.now();
  const entry = loginAttempts.get(email);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.set(email, { count: 1, firstAttempt: now, lockedUntil: null });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.lockedUntil = now + LOCK_MS;
}

function recordSuccess(email: string) {
  loginAttempts.delete(email);
}

export const authOptions: AuthOptions = {
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase();

        if (isLocked(email)) {
          throw new Error("Muitas tentativas de login. Tente novamente em alguns minutos.");
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          recordFailure(email);
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          recordFailure(email);
          await logAudit({ action: "login.failed", entityType: "User", entityId: user.id });
          return null;
        }

        recordSuccess(email);
        await logAudit({ userId: user.id, action: "login.success", entityType: "User", entityId: user.id });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
};

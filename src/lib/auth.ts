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

const PAPEL_VALIDADE_MS = 5 * 60_000;
const papeis = new Map<string, { role: string; ate: number }>();
function guardarPapel(userId: string, role: string) {
  papeis.set(userId, { role, ate: Date.now() + PAPEL_VALIDADE_MS });
}
async function papelAtualDe(userId: string): Promise<string | null> {
  const guardado = papeis.get(userId);
  if (guardado && guardado.ate > Date.now()) return guardado.role;
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!u) return null;
    guardarPapel(userId, u.role);
    return u.role;
  } catch {
    return guardado?.role ?? null; // banco indisponivel: segue com o papel que ja estava no token
  }
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
          primeiroAcesso: user.primeiroAcesso,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.primeiroAcesso = (user as any).primeiroAcesso;
        guardarPapel((user as any).id, (user as any).role); // login traz o papel do banco: vale na hora, sem esperar a guarda anterior expirar
      }
      // O papel vive no token por 7 dias; quando o administrador troca o tipo de acesso de alguem (ex.: virou Diretor Master, ou deixou de ser Admin),
      // vale em ate 5 minutos, sem esperar novo login. A leitura do banco e' guardada em memoria para nao pesar em toda chamada.
      if (token.id) {
        const atual = await papelAtualDe(token.id as string);
        if (atual) token.role = atual;
      }
      // depois de completar o cadastro, o front chama update() da sessao --
      // reconsulta o banco pra refletir primeiroAcesso=false sem exigir novo login
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({ where: { id: token.id as string } });
        if (fresh) {
          token.primeiroAcesso = fresh.primeiroAcesso;
          token.email = fresh.email;
          // o primeiro acesso define o cargo -> role; refletir na hora,
          // sem exigir novo login
          token.role = fresh.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).primeiroAcesso = token.primeiroAcesso;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
};

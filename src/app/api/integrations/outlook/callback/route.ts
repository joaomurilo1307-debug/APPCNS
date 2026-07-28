import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForToken, fetchMe } from "@/lib/microsoftGraph";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("outlook_oauth_state="))
    ?.split("=")[1];

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/calendario?outlook=erro", req.url));
  }

  const userId = (session.user as any).id;

  try {
    const token = await exchangeCodeForToken(code);
    const expiresAt = new Date(Date.now() + token.expires_in * 1000);

    await prisma.outlookAccount.upsert({
      where: { userId },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? "",
        expiresAt,
      },
      create: {
        userId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? "",
        expiresAt,
      },
    });

    const email = await fetchMe(userId);
    if (email) await prisma.outlookAccount.update({ where: { userId }, data: { msEmail: email } });

    const res = NextResponse.redirect(new URL("/calendario?outlook=conectado", req.url));
    res.cookies.delete("outlook_oauth_state");
    return res;
  } catch {
    return NextResponse.redirect(new URL("/calendario?outlook=erro", req.url));
  }
}

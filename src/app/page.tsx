import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { landingPathForRole } from "@/lib/permissions";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  redirect(landingPathForRole((session.user as any).role));
}

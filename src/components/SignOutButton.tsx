"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
    >
      Sair
    </button>
  );
}

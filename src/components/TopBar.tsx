"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";

type Me = { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo: string | null };

export default function TopBar() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => {});
  }, []);

  if (!me) return <div className="h-14 shrink-0 border-b border-gray-100 bg-white" />;

  return (
    <div className="flex h-14 shrink-0 items-center justify-end border-b border-gray-100 bg-white px-6">
      <Link href="/minha-conta" className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-gray-50">
        <div className="text-right">
          <p className="text-sm font-medium leading-tight">{me.name}</p>
          {me.cargo && <p className="text-xs leading-tight text-gray-400">{me.cargo}</p>}
        </div>
        <Avatar name={me.name} color={me.avatarColor} photoUrl={me.avatarUrl} size={34} />
      </Link>
    </div>
  );
}

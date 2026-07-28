"use client";

import { useEffect, useState } from "react";
import Avatar from "./Avatar";

type Person = { id: string; name: string; avatarColor: string; role: string; online: boolean };

export default function OnlinePeopleWidget({ currentUserId }: { currentUserId: string }) {
  const [people, setPeople] = useState<Person[]>([]);

  async function load() {
    const res = await fetch("/api/presence");
    if (res.ok) setPeople(await res.json());
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  const online = people.filter((p) => p.online && p.id !== currentUserId);
  const offline = people.filter((p) => !p.online && p.id !== currentUserId);

  return (
    <div className="flex flex-col gap-2">
      {online.map((p) => (
        <div key={p.id} className="flex items-center gap-2 text-sm">
          <span className="relative shrink-0">
            <Avatar name={p.name} color={p.avatarColor} size={24} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500" />
          </span>
          <span className="truncate">{p.name}</span>
        </div>
      ))}
      {online.length === 0 && <p className="text-xs text-gray-400">Ninguém online agora.</p>}
      {offline.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-gray-400">+{offline.length} offline</summary>
          <div className="mt-2 flex flex-col gap-2">
            {offline.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm text-gray-400">
                <span className="relative shrink-0">
                  <Avatar name={p.name} color={p.avatarColor} size={24} />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300" />
                </span>
                <span className="truncate">{p.name}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

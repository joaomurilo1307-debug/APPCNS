export type ActiveChatInfo =
  | { type: "direct"; id: string; name: string; avatarColor?: string }
  | { type: "team"; id: string; name: string };

const KEY = "cns_active_chat";
const EVENT = "cns:activechat";

/**
 * avatarUrl (foto de perfil) pode ser um data: URI de várias centenas de KB —
 * nunca persistir isso no localStorage nem guardar no estado de chat ativo,
 * trava a aba ao serializar/desserializar e ao re-renderizar o <img> a cada poll.
 */
export function setActiveChat(info: ActiveChatInfo) {
  localStorage.setItem(KEY, JSON.stringify(info));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function clearActiveChat() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getActiveChat(): ActiveChatInfo | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveChatInfo) : null;
  } catch {
    return null;
  }
}

export function subscribeActiveChat(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

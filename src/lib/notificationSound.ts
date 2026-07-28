let ctx: AudioContext | null = null;

export function playNotificationSound() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    [0, 0.15].forEach((delay, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 880 : 1108;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.15, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.2);
    });
  } catch {
    // audio indisponivel (autoplay bloqueado, navegador sem suporte) — falha silenciosa
  }
}

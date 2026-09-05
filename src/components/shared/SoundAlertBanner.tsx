import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { BellRing, X } from 'lucide-react';

interface Props {
  message: ReactNode;
  stopLabel: string;
  onStop: () => void;
  /**
   * When set, the alert renders as a small, friendly corner toast that
   * slides itself away after this many ms instead of the full-width bar
   * below — for alerts that are just an FYI (e.g. "a new order came in")
   * rather than ones someone must actively act on before they go away.
   * Leave unset for alerts tied to a continuously-repeating alarm sound
   * (e.g. "order ready for pickup"), which should stay impossible to miss
   * until explicitly stopped.
   */
  autoDismissMs?: number;
}

export default function SoundAlertBanner({ message, stopLabel, onStop, autoDismissMs }: Props) {
  // Drives the slide/fade-out transition before actually calling onStop,
  // so the toast doesn't just vanish mid-frame. The caller is expected to
  // give this component a fresh `key` whenever the alert's content changes
  // (e.g. a second new order bumps the count) — that remounts this
  // component with `leaving` back at its initial `false`, which both
  // restarts the auto-dismiss countdown and avoids ever needing to reset
  // state from inside an effect.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!autoDismissMs) return;
    const hideTimer = setTimeout(() => setLeaving(true), autoDismissMs);
    return () => clearTimeout(hideTimer);
  }, [autoDismissMs]);

  useEffect(() => {
    if (!leaving) return;
    // Matches the CSS transition duration below.
    const t = setTimeout(onStop, 200);
    return () => clearTimeout(t);
  }, [leaving, onStop]);

  if (autoDismissMs) {
    return (
      <div
        role="status"
        className={`fixed top-3 end-3 z-[100] flex w-[calc(100%-1.5rem)] max-w-sm items-start gap-3 rounded-2xl bg-zinc-900/95 px-4 py-3.5 text-white shadow-soft-lg backdrop-blur transition-all duration-200 ease-out ${
          leaving ? 'translate-y-[-8px] scale-95 opacity-0' : 'translate-y-0 scale-100 opacity-100'
        }`}
        style={{ marginTop: 'env(safe-area-inset-top)' }}
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-400">
          <BellRing size={16} />
        </span>
        <p className="flex-1 pt-1 text-[13px] font-semibold leading-snug">{message}</p>
        <button
          onClick={() => setLeaving(true)}
          aria-label={stopLabel}
          className="-me-1 -mt-1 shrink-0 rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white active:scale-95"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  // Full-width, high-contrast bar for an alert that keeps ringing until
  // someone deliberately silences it: the "order ready for pickup" alarm
  // on the customer side. Deliberately `fixed` at the very top of the
  // viewport, above everything else (including the app's own sticky
  // headers/sidebar) — the whole point is that it should be impossible to
  // miss, even if it briefly overlaps other chrome while it's showing.
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] flex items-center gap-3 bg-red-600 px-4 py-3 text-white shadow-lg"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
    >
      <span className="flex h-8 w-8 shrink-0 animate-pulse items-center justify-center rounded-full bg-white/15">
        <BellRing size={17} />
      </span>
      <p className="flex-1 text-sm font-bold leading-snug">{message}</p>
      <button
        onClick={onStop}
        className="shrink-0 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-bold transition hover:bg-white/25 active:scale-95"
      >
        {stopLabel}
      </button>
    </div>
  );
}

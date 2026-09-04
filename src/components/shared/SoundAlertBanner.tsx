import type { ReactNode } from 'react';
import { BellRing } from 'lucide-react';

interface Props {
  message: ReactNode;
  stopLabel: string;
  onStop: () => void;
}

/**
 * Full-width, high-contrast bar for an alert that keeps ringing until
 * someone deliberately silences it: the "new order" alarm on the admin
 * side, and the "order ready for pickup" alarm on the customer side.
 *
 * Deliberately `fixed` at the very top of the viewport, above everything
 * else (including the app's own sticky headers/sidebar) — the whole point
 * is that it should be impossible to miss, even if it briefly overlaps
 * other chrome while it's showing.
 */
export default function SoundAlertBanner({ message, stopLabel, onStop }: Props) {
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

// A short, friendly two-note "ding-dong" for order status updates,
// synthesized with the Web Audio API instead of an audio file — no asset
// to host, no extra network request, works the same on every device.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/**
 * Browsers block audio that starts without a user gesture, and the status
 * check that triggers the chime runs on a background timer, not a click —
 * so the audio context needs to be "unlocked" ahead of time from inside a
 * real gesture (see MenuPage's page-wide first-tap listener). Safe to call
 * repeatedly; does nothing once already running.
 */
export function unlockChime(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

/** Plays the chime. No-ops silently if Web Audio isn't available or the
 *  context is still locked (e.g. no user gesture has happened yet). */
export function playChime(): void {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const now = c.currentTime;
  [880, 660].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.15;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

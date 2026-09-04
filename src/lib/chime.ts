// Synthesized (no audio files to host) alert sounds for the order
// notification system, built on the Web Audio API. Three layers:
//   1. playChime()         — the original short two-note "ding-dong".
//   2. playStatusChime()   — a distinct short motif per order status, so a
//      transition to "preparing" doesn't sound like "out for delivery".
//   3. startAlarm()/stopAlarm() — a louder, repeating alert for moments
//      that need someone's active attention (new order for the kitchen,
//      "ready for pickup" for the customer) until explicitly silenced.
import type { OrderStatus } from './types';

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
 * checks that trigger these sounds run on background timers, not clicks —
 * so the audio context needs to be "unlocked" ahead of time from inside a
 * real gesture (see the page-wide first-tap listeners in MenuPage and
 * AdminLayout). Safe to call repeatedly; does nothing once already running.
 */
export function unlockChime(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

interface Note {
  freq: number;
  /** Offset from "now", in seconds. */
  at: number;
  /** Note length, in seconds. */
  dur: number;
  type?: OscillatorType;
  peak?: number;
}

function playNotes(notes: Note[]): void {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const now = c.currentTime;
  notes.forEach(({ freq, at, dur, type = 'sine', peak = 0.2 }) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const start = now + at;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  });
}

/** The original short, friendly two-note "ding-dong". Kept as the default/
 *  fallback sound (e.g. the "order confirmed" motif below reuses it). */
export function playChime(): void {
  playNotes([
    { freq: 880, at: 0, dur: 0.35 },
    { freq: 660, at: 0.15, dur: 0.35 },
  ]);
}

/** A distinct, short motif per order status, so every stage transition —
 *  not just "is there an update" — is recognizable by ear alone. Falls
 *  back to the generic chime for any status without a dedicated motif
 *  (e.g. "pending", which is never announced this way in practice). */
export function playStatusChime(status: OrderStatus): void {
  switch (status) {
    case 'confirmed':
      // Warm two-note "ding-dong" — the order was just accepted.
      playChime();
      break;
    case 'preparing':
      // Three quick ascending notes — things are moving in the kitchen.
      playNotes([
        { freq: 523, at: 0, dur: 0.16 },
        { freq: 659, at: 0.1, dur: 0.16 },
        { freq: 784, at: 0.2, dur: 0.22 },
      ]);
      break;
    case 'ready':
      // Bright triple beep. Used as a one-off notice for cases that don't
      // get the continuous pickup alarm (see startAlarm below) — e.g. a
      // delivery order reaching "ready", which just means it's now
      // waiting on a driver, not on the customer.
      playNotes([
        { freq: 1046, at: 0, dur: 0.14, peak: 0.22 },
        { freq: 1046, at: 0.16, dur: 0.14, peak: 0.22 },
        { freq: 1318, at: 0.32, dur: 0.28, peak: 0.22 },
      ]);
      break;
    case 'out_for_delivery':
      // Two-note "departure" glide, moving downward.
      playNotes([
        { freq: 988, at: 0, dur: 0.22, type: 'triangle' },
        { freq: 622, at: 0.12, dur: 0.3, type: 'triangle' },
      ]);
      break;
    case 'completed':
      // Small resolving chord — a settled, "all done" feeling.
      playNotes([
        { freq: 659, at: 0, dur: 0.5, peak: 0.14 },
        { freq: 831, at: 0, dur: 0.5, peak: 0.14 },
        { freq: 988, at: 0, dur: 0.6, peak: 0.14 },
      ]);
      break;
    case 'cancelled':
      // Low descending buzz.
      playNotes([
        { freq: 330, at: 0, dur: 0.25, type: 'sawtooth', peak: 0.15 },
        { freq: 220, at: 0.12, dur: 0.35, type: 'sawtooth', peak: 0.15 },
      ]);
      break;
    default:
      playChime();
  }
}

// ---------------------------------------------------------------------
// Continuous alarm — for the one case that genuinely needs someone's
// active attention until they act on it: an order that's ready and
// waiting on the customer to come get it. (New order arrivals use the
// one-shot playNewOrderChime() above instead.) Module-level singleton
// timer so it's safe to call startAlarm() from more than one place and
// to call stopAlarm() from an entirely different component (e.g. a
// "stop" button rendered by whoever is showing the alert banner)
// without either side needing to hold a reference to it.
// ---------------------------------------------------------------------

/** A brief, noticeably bright alert for a new incoming order on the
 *  admin/kitchen side — plays once per new order arrival, not a loop. */
export function playNewOrderChime(): void {
  playNotes([
    { freq: 988, at: 0, dur: 0.16, peak: 0.24 },
    { freq: 1318, at: 0.14, dur: 0.16, peak: 0.24 },
    { freq: 988, at: 0.28, dur: 0.3, peak: 0.24 },
  ]);
}

let alarmTimer: ReturnType<typeof setInterval> | null = null;

function playAlarmBurst(): void {
  playNotes([
    { freq: 1046, at: 0, dur: 0.16, type: 'square', peak: 0.25 },
    { freq: 784, at: 0.2, dur: 0.16, type: 'square', peak: 0.25 },
    { freq: 1046, at: 0.4, dur: 0.16, type: 'square', peak: 0.25 },
    { freq: 784, at: 0.6, dur: 0.2, type: 'square', peak: 0.25 },
  ]);
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate([200, 100, 200]);
  }
}

/** Starts the repeating, attention-grabbing alarm. Idempotent — calling
 *  it again while already running does not stack a second interval. */
export function startAlarm(intervalMs = 1500): void {
  if (alarmTimer) return;
  playAlarmBurst();
  alarmTimer = setInterval(playAlarmBurst, intervalMs);
}

/** Silences the alarm started by startAlarm(). Safe to call even if no
 *  alarm is currently running. */
export function stopAlarm(): void {
  if (alarmTimer) {
    clearInterval(alarmTimer);
    alarmTimer = null;
  }
}

export function isAlarmActive(): boolean {
  return alarmTimer !== null;
}

/**
 * Generic pulsing placeholder block. Compose these into shapes that match
 * the real content's layout (a product card, a banner, a category circle...)
 * so the page's structure is recognizable before data arrives, instead of a
 * blank screen with a spinner. Sizing/shape is entirely up to the caller via
 * `className` (e.g. `h-4 w-24 rounded-md`, `aspect-[2/1] rounded-2xl`).
 */
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-200/70 ${className}`} />;
}

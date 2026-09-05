import Skeleton from '../ui/Skeleton';

/** Placeholder shaped like an order card, shown while the first fetch is
 *  in flight instead of a plain spinner — the list feels like it's already
 *  there and about to fill in, rather than a blank pause. */
function OrderCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white driver-dark:bg-zinc-900 p-4 shadow-soft ring-1 ring-zinc-100 driver-dark:ring-zinc-800">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3.5 w-full max-w-[220px]" />
        <Skeleton className="h-3.5 w-16" />
      </div>
      <Skeleton className="h-12 w-20 shrink-0 rounded-xl" />
    </div>
  );
}

export default function OrderListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  );
}

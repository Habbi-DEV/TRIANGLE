export default function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-400">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-500 border-t-transparent" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

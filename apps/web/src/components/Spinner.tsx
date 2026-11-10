// Carga (DESIGN.md §7): indicador giratorio + texto para acciones;
// esqueleto con la forma del contenido real para listas y paneles.
export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-white/70">
      <span
        aria-hidden="true"
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-reto-gold"
      />
      {label}
    </p>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-skeleton-pulse rounded-lg bg-white/10 ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-card border border-reto-gold/40 bg-reto-surface p-4" aria-hidden="true">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-3 h-4 w-1/3" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <Skeleton className="mt-4 h-10 w-full rounded-full" />
    </div>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3" role="status" aria-label="Cargando contenido">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

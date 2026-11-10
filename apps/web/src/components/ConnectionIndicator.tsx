// Indicador de conexión siempre visible en la partida y el área de
// juegos (DESIGN.md §7): Conectado / Reconectando… / Sin conexión.
export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

const META: Record<ConnectionStatus, { label: string; className: string; dot: string }> = {
  connected: { label: 'Conectado', className: 'bg-reto-success/15 text-reto-success', dot: 'bg-reto-success' },
  reconnecting: { label: 'Reconectando…', className: 'bg-reto-warning/15 text-reto-warning', dot: 'bg-reto-warning' },
  offline: { label: 'Sin conexión', className: 'bg-reto-error/15 text-reto-error', dot: 'bg-reto-error' },
};

export default function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const meta = META[status];
  return (
    <p role="status" aria-live="polite" className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`}>
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </p>
  );
}

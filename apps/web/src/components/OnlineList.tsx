// Panel lateral de personas en línea (DESIGN.md §2, doc 04 §5.4; v7
// APROBADA): contador, lista con SOLO nombre e insignia de estado
// (punto de color + nombre + estado, sin avatar en las filas), leyenda
// y persona por invitar aparte. Cada LIBRE tiene botón «Retar».
// Filas pequeñas (tarjeta padding 8px 10px, filas padding 5px 0).
'use client';

import type { OnlinePerson, PresenceStatus } from '../lib/types';
import { Button } from './ui';

export const PRESENCE_META: Record<PresenceStatus, { color: string; symbol: string; dot: string }> = {
  LIBRE: { color: 'bg-reto-success/15 text-reto-success', symbol: '●', dot: 'bg-reto-success' },
  'EN LÍNEA': { color: 'bg-white/10 text-white/80', symbol: '○', dot: 'bg-white/60' },
  JUGANDO: { color: 'bg-reto-info/15 text-reto-info', symbol: '⇄', dot: 'bg-reto-info' },
  'POR JUGAR': { color: 'bg-reto-warning/15 text-reto-warning', symbol: '◷', dot: 'bg-reto-warning' },
  'RETO PENDIENTE': { color: 'bg-reto-pink/15 text-reto-pink', symbol: '✉', dot: 'bg-reto-pink' },
  'RETO GENERADO': { color: 'bg-[#7c3aed]/15 text-[#c4b5fd]', symbol: '⚡', dot: 'bg-[#7c3aed]' },
  'POR INVITAR': { color: 'bg-reto-gold/15 text-reto-gold', symbol: '+', dot: 'bg-reto-gold' },
};

export function PresenceBadge({ status }: { status: PresenceStatus }) {
  const meta = PRESENCE_META[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.color}`}>
      <span aria-hidden="true">{meta.symbol}</span>
      {status}
    </span>
  );
}

export default function OnlineList({
  people,
  inviteeName,
  onChallenge,
  loading = false,
  meId,
}: {
  people: OnlinePerson[];
  inviteeName?: string | null;
  onChallenge?: (person: OnlinePerson) => void;
  loading?: boolean;
  /** Id del usuario actual: se marca como «Tú» y no se le reta. */
  meId?: string | null;
}) {
  const statuses: PresenceStatus[] = [
    'LIBRE',
    'EN LÍNEA',
    'JUGANDO',
    'POR JUGAR',
    'RETO PENDIENTE',
    'RETO GENERADO',
  ];
  return (
    <section aria-label="Personas en línea" className="w-full rounded-card border border-reto-gold/40 bg-reto-surface px-2.5 py-2 text-[13px]">
      <h2 className="font-display text-sm font-bold">
        Personas en línea{' '}
        <span className="text-reto-gold" aria-label={`${people.length} personas en línea`}>
          ({people.length})
        </span>
      </h2>

      {inviteeName && (
        <div className="mt-2 rounded-lg border border-reto-gold/40 bg-reto-gold/10 p-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-reto-gold">Por invitar</p>
          <div className="mt-1 flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-reto-gold" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{inviteeName}</span>
            <PresenceBadge status="POR INVITAR" />
          </div>
        </div>
      )}

      {loading ? (
        <p role="status" className="mt-3 text-sm text-white/60">
          Cargando personas en línea…
        </p>
      ) : people.length === 0 ? (
        <p className="mt-3 text-sm text-white/60">No hay nadie en línea ahora mismo.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {people.map((p) => {
            const isMe = meId != null && p.userId === meId;
            return (
              <li key={p.userId} className="flex flex-wrap items-center gap-1.5 border-b border-reto-gold/10 py-[5px] last:border-b-0">
                <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${PRESENCE_META[p.status].dot}`} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {p.username}
                  {isMe && <span className="text-white/50"> (tú)</span>}
                </span>
                <PresenceBadge status={p.status} />
                {!isMe && p.status === 'LIBRE' && onChallenge && (
                  <Button variant="secondary" className="min-h-[32px] px-2 py-0.5 text-[11px]" onClick={() => onChallenge(p)}>
                    Retar
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="mt-4 text-xs text-white/60">
        <summary className="cursor-pointer font-semibold text-white/80">Leyenda de estados</summary>
        <ul className="mt-2 flex flex-col gap-1">
          {statuses.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${PRESENCE_META[s].dot}`} />
              <strong className="text-white/80">{s}</strong>
              <span>
                {s === 'LIBRE' && 'en línea y sin reto en curso'}
                {s === 'EN LÍNEA' && 'en línea'}
                {s === 'JUGANDO' && 'en una partida en curso'}
                {s === 'POR JUGAR' && 'con reto aceptado, a punto de empezar'}
                {s === 'RETO PENDIENTE' && 'tiene un reto sin responder'}
                {s === 'RETO GENERADO' && 'acaba de generar un reto'}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

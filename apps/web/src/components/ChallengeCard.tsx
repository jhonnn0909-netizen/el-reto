// Tarjeta de reto (DESIGN.md §4): orden fijo título → dato principal
// → metadatos → acción. Creador, formato, premio DEMO, estado y
// tiempo desde su creación. «Ver partida» en retos en curso (mejora 5).
'use client';

import Link from 'next/link';
import type { Challenge, Match } from '../lib/types';
import { FORMAT_LABELS } from '../lib/game';
import { formatCreditsDemo, timeAgo } from '../lib/format';
import { Avatar, Button } from './ui';
import { DemoBadge } from './DemoBadge';

const STATUS_LABEL: Record<Challenge['status'], string> = {
  OPEN: 'Abierto',
  ACCEPTED: 'Aceptado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Caducado',
  COMPLETED: 'Terminado',
};

export default function ChallengeCard({
  challenge,
  onAccept,
  accepting = false,
  match,
}: {
  challenge: Challenge;
  onAccept?: (challenge: Challenge) => void;
  accepting?: boolean;
  /** Partida en curso asociada (para el botón «Ver partida»). */
  match?: Match | null;
}) {
  const creator = challenge.creatorUsername ?? 'Jugador';
  const isLive = challenge.status === 'ACCEPTED' && match;
  return (
    <article className="flex flex-col gap-3 rounded-card border border-reto-gold/40 bg-reto-surface p-4">
      <div className="flex items-center gap-3">
        <Avatar name={creator} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-bold">{creator}</h3>
          <p className="text-xs text-white/60">{timeAgo(challenge.createdAt)}</p>
        </div>
        <span className="rounded-full bg-reto-elevated px-2.5 py-1 text-xs font-semibold text-reto-gold">
          {FORMAT_LABELS[challenge.format]}
        </span>
      </div>
      {challenge.stakeCredits > 0 && (
        <p className="flex items-center gap-2 text-sm">
          <span className="font-mono font-semibold text-reto-demo">{formatCreditsDemo(challenge.stakeCredits)}</span>
          <DemoBadge />
        </p>
      )}
      <p className="text-sm text-white/60">
        Estado: <span className="font-semibold text-reto-cream">{STATUS_LABEL[challenge.status]}</span>
      </p>
      <div className="mt-auto flex gap-2">
        {isLive ? (
          <Link href={`/partidas/${match.id}`} className="flex-1">
            <Button variant="secondary" className="w-full">
              Ver partida
            </Button>
          </Link>
        ) : challenge.status === 'OPEN' ? (
          onAccept ? (
            <Button className="flex-1" onClick={() => onAccept(challenge)} disabled={accepting}>
              {accepting ? 'Aceptando…' : 'Aceptar reto'}
            </Button>
          ) : (
            <Link href={`/retos/${challenge.id}`} className="flex-1">
              <Button className="w-full">Aceptar reto</Button>
            </Link>
          )
        ) : null}
        <Link href={`/retos/${challenge.id}`} className={challenge.status === 'OPEN' ? '' : 'flex-1'}>
          <Button variant="secondary" className={challenge.status === 'OPEN' ? '' : 'w-full'}>
            Ver reto
          </Button>
        </Link>
      </div>
    </article>
  );
}

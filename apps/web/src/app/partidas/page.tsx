// Historial de partidas (DESIGN.md §9): fecha, rival, formato,
// resultado con texto + icono + color, marcador final y premio DEMO.
// Filtros por resultado. «Ver partida» en las en curso (mejora 5).
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { gameApi } from '../../lib/auth';
import { asList, useApiData } from '../../lib/useApi';
import { formatDateTime, formatScore } from '../../lib/format';
import { FORMAT_LABELS } from '../../lib/game';
import type { Match } from '../../lib/types';
import EmptyState from '../../components/EmptyState';
import { ListSkeleton } from '../../components/Spinner';
import { Button, PageHeader } from '../../components/ui';

function resultOf(m: Match, meId: string | null): 'win' | 'lose' | 'tie' | 'live' {
  if (m.status === 'IN_PROGRESS' || m.status === 'WAITING') return 'live';
  if (m.status !== 'FINISHED') return 'tie';
  if (!m.winnerId) return 'tie';
  return m.winnerId === meId ? 'win' : 'lose';
}

const RESULT_META = {
  win: { label: 'Victoria', icon: '🏆', className: 'bg-reto-success/15 text-reto-success' },
  lose: { label: 'Derrota', icon: '✕', className: 'bg-reto-error/15 text-reto-error' },
  tie: { label: 'Empate', icon: '=', className: 'bg-white/10 text-white/80' },
  live: { label: 'En curso', icon: '●', className: 'bg-reto-info/15 text-reto-info' },
} as const;

export default function MatchesPage() {
  const [filter, setFilter] = useState<'ALL' | 'win' | 'lose' | 'tie' | 'live'>('ALL');
  const meId = typeof window !== 'undefined' ? (JSON.parse(window.localStorage.getItem('elreto.user') ?? 'null')?.id as string | null) ?? null : null;

  const matches = useApiData<Match[]>(
    () => gameApi.listMatches(1, 20).then((r) => asList(r)),
    'matches-list',
  );

  const visible = (matches.data ?? []).filter((m) => filter === 'ALL' || resultOf(m, meId) === filter);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title="Historial de partidas" subtitle="Tus partidas, de la más reciente a la más antigua." />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por resultado">
        {(['ALL', 'win', 'lose', 'tie', 'live'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-[44px] rounded-full px-4 text-sm font-semibold ${
              filter === f ? 'bg-gradient-to-b from-reto-goldLight via-reto-gold to-reto-goldDark text-[#1a1206]' : 'border border-white/15 bg-reto-elevated'
            }`}
          >
            {f === 'ALL' ? 'Todas' : RESULT_META[f].label}
          </button>
        ))}
      </div>

      {matches.status === 'loading' && <ListSkeleton count={4} />}
      {matches.status === 'error' && (
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">{matches.error}</p>
          <Button variant="secondary" className="mt-3" onClick={matches.reload}>Reintentar</Button>
        </div>
      )}
      {matches.status === 'ok' && visible.length === 0 && (
        <EmptyState
          illustration="hands"
          title="Aún no has jugado ninguna partida."
          description="Crea tu primer reto y juega en menos de un minuto."
          actionLabel="Jugar ahora"
          actionHref="/retos/crear"
        />
      )}
      {matches.status === 'ok' && visible.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visible.map((m) => {
            const result = resultOf(m, meId);
            const meta = RESULT_META[result];
            const rival = m.player1Id === meId ? m.player2Username ?? 'Rival' : m.player1Username ?? 'Rival';
            return (
              <li key={m.id} className="rounded-card border border-reto-gold/40 bg-reto-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Contra {rival}</p>
                    <p className="text-xs text-white/50">
                      {formatDateTime(m.createdAt)} · {FORMAT_LABELS[m.format]} · Piedra, papel o tijera
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
                    <span aria-hidden="true">{meta.icon}</span> {meta.label}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="font-mono text-lg font-bold">{formatScore(m.score1, m.score2)}</p>
                  {m.stakeCredits > 0 && (
                    <p className="text-xs text-white/60">
                      Premio: <span className="font-mono text-reto-demo">{m.stakeCredits} créditos DEMO</span>
                    </p>
                  )}
                  <Link href={`/partidas/${m.id}`} className="text-sm text-reto-gold underline underline-offset-2">
                    {result === 'live' ? 'Ver partida' : 'Ver detalle'}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

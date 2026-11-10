// Tarjetas de juegos del área de juegos (mejora: área de juegos):
// piedra, papel o tijera jugable; damas, damas chinas y conecta cuatro
// como «Próximamente» (visibles pero no jugables, con su color de acento).
'use client';

import Link from 'next/link';
import type { Game } from '../lib/types';
import { Button } from './ui';

export const FALLBACK_GAMES: Game[] = [
  {
    id: 'rps',
    slug: 'RPS',
    name: 'Piedra, papel o tijera',
    description: 'Reta en vivo a quien quieras y gana en segundos.',
    status: 'PLAYABLE',
    accentColor: '#f5c542',
    players: 2,
  },
  {
    id: 'checkers',
    slug: 'CHECKERS',
    name: 'Damas',
    description: 'El clásico juego de tablero, en duelos rápidos.',
    status: 'COMING_SOON',
    accentColor: '#f59e0b',
    players: 2,
  },
  {
    id: 'chinese-checkers',
    slug: 'CHINESE_CHECKERS',
    name: 'Damas chinas',
    description: 'Lleva tus fichas al otro lado antes que tu rival.',
    status: 'COMING_SOON',
    accentColor: '#ec4899',
    players: 2,
  },
  {
    id: 'connect-four',
    slug: 'CONNECT_FOUR',
    name: 'Conecta cuatro',
    description: 'Cuatro en línea y ganas. Rápido y directo.',
    status: 'COMING_SOON',
    accentColor: '#22c55e',
    players: 2,
  },
];

export function GameCard({ game }: { game: Game }) {
  const playable = game.status === 'PLAYABLE';
  return (
    <article
      className="flex flex-col gap-2 rounded-card border border-reto-gold/40 bg-reto-surface p-5"
      style={{ borderTop: `4px solid ${game.accentColor}` }}
      aria-label={`${game.name}${playable ? '' : ' (próximamente)'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold">{game.name}</h3>
        {playable ? (
          <span className="rounded-full bg-reto-success/15 px-2.5 py-1 text-xs font-semibold text-reto-success">
            Jugable
          </span>
        ) : (
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80">
            Próximamente
          </span>
        )}
      </div>
      <p className="flex-1 text-sm leading-relaxed text-white/60">{game.description}</p>
      <p className="text-xs text-white/50">{game.players} jugadores</p>
      {playable ? (
        <Link href="/retos/crear">
          <Button className="w-full">Jugar ahora</Button>
        </Link>
      ) : (
        <Button disabled aria-disabled="true" className="w-full" title="Este juego aún no está disponible">
          Próximamente
        </Button>
      )}
    </article>
  );
}

// Tarjeta «Reto del día» (mejora 6): premio 100 créditos DEMO.
export function DailyChallengeCard({
  formatLabel,
  stakeCredits = 100,
  onPlay,
  busy = false,
}: {
  formatLabel: string;
  stakeCredits?: number;
  onPlay: () => void;
  busy?: boolean;
}) {
  return (
    <section
      aria-label="Reto del día"
      className="rounded-card border border-reto-gold/50 bg-gradient-to-r from-reto-surface to-reto-elevated p-5"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-reto-gold">Reto del día</p>
      <h2 className="mt-1 font-display text-xl font-bold">Un reto nuevo cada día</h2>
      <p className="mt-1 text-sm text-white/70">
        Formato: <strong className="text-reto-cream">{formatLabel}</strong> · Premio:{' '}
        <strong className="font-mono text-reto-demo">{stakeCredits} créditos DEMO</strong>
      </p>
      <Button className="mt-4" onClick={onPlay} disabled={busy}>
        {busy ? 'Buscando el reto…' : 'Jugar reto del día'}
      </Button>
    </section>
  );
}

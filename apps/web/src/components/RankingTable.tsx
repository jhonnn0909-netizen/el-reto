// Tabla de posiciones (doc 04 D8): victorias, rachas y mejor racha,
// con nivel e insignia (mejoras 1 y 9). En móvil, tarjetas apiladas
// con los mismos datos y el mismo orden (DESIGN.md §10).
'use client';

import Link from 'next/link';
import type { RankingEntry } from '../lib/types';
import { Avatar } from './ui';

export function LevelBadge({ level, levelTitle }: { level?: number; levelTitle?: string }) {
  if (level === undefined && !levelTitle) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-reto-gold/15 px-2 py-0.5 text-[11px] font-bold text-reto-gold ring-1 ring-reto-gold/40"
      title={levelTitle ? `Nivel ${level ?? ''}: ${levelTitle}` : undefined}
    >
      <span aria-hidden="true">★</span>
      {level !== undefined ? `Nv. ${level}` : ''}
      {levelTitle ? ` ${levelTitle}` : ''}
    </span>
  );
}

function Streak({ label, value }: { label: string; value?: number }) {
  return (
    <span className="text-xs text-white/70">
      {label}: <strong className="font-mono text-reto-cream">{value ?? 0}</strong>
    </span>
  );
}

/** Medalla de posición (muestra negro y oro): 1.º dorado, 2.º plateado, 3.º bronce. */
export function Medal({ position }: { position: number | null }) {
  const styles: Record<number, string> = {
    1: 'bg-gradient-to-b from-reto-goldLight to-reto-goldDark text-[#1a1206]',
    2: 'bg-gradient-to-b from-white to-reto-silver text-[#1a1206]',
    3: 'bg-gradient-to-b from-reto-bronzeLight to-reto-bronze text-white',
  };
  // Sin posición (usuario sin fila de ranking): guion, sin medalla.
  if (position === null) {
    return <span className="inline-flex h-[22px] w-[22px] items-center justify-center font-mono text-sm font-bold text-reto-cream/70">–</span>;
  }
  const cls = styles[position];
  if (!cls) {
    return <span className="inline-flex h-[22px] w-[22px] items-center justify-center font-mono text-sm font-bold text-reto-cream/70">{position}</span>;
  }
  return (
    <span
      className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs font-black ${cls}`}
      aria-label={`Posición ${position}`}
    >
      {position}
    </span>
  );
}

export default function RankingTable({ entries }: { entries: RankingEntry[] }) {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
  );
  return (
    <div>
      {/* Escritorio y tableta: tabla */}
      <table className="hidden w-full border-collapse md:table">
        <caption className="sr-only">Tabla de posiciones del ranking</caption>
        <thead>
          <tr className="border-b border-reto-gold/40 text-left text-xs uppercase tracking-wide text-white/50">
            <th scope="col" className="px-3 py-2">#</th>
            <th scope="col" className="px-3 py-2">Jugador</th>
            <th scope="col" className="px-3 py-2">Nivel</th>
            <th scope="col" className="px-3 py-2">Victorias</th>
            <th scope="col" className="px-3 py-2">Racha</th>
            <th scope="col" className="px-3 py-2">Mejor racha</th>
            <th scope="col" className="px-3 py-2">Partidas</th>
            <th scope="col" className="px-3 py-2">Puntos</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.userId} className="border-b border-white/5 text-sm">
              <td className="px-3 py-3">
                <Medal position={e.position} />
              </td>
              <td className="px-3 py-3">
                <span className="flex items-center gap-2">
                  <Avatar name={e.username} size={28} />
                  <Link href={`/perfil?u=${encodeURIComponent(e.username)}`} className="font-semibold underline-offset-2 hover:underline">
                    {e.username}
                  </Link>
                </span>
              </td>
              <td className="px-3 py-3">
                <LevelBadge level={e.level} levelTitle={e.levelTitle} />
              </td>
              <td className="px-3 py-3 font-mono">{e.wins}</td>
              <td className="px-3 py-3 font-mono">{e.currentStreak ?? 0}</td>
              <td className="px-3 py-3 font-mono">{e.bestStreak ?? 0}</td>
              <td className="px-3 py-3 font-mono">{e.matchesPlayed}</td>
              <td className="px-3 py-3 font-mono font-bold">{e.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Móvil: tarjetas apiladas */}
      <ul className="flex flex-col gap-3 md:hidden">
        {sorted.map((e) => (
          <li key={e.userId} className="rounded-card border border-reto-gold/40 bg-reto-surface p-4">
            <div className="flex items-center gap-3">
              <Medal position={e.position} />
              <Avatar name={e.username} size={32} />
              <span className="flex-1 truncate font-semibold">{e.username}</span>
              <LevelBadge level={e.level} levelTitle={e.levelTitle} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-xs text-white/70">
                Victorias: <strong className="font-mono text-reto-cream">{e.wins}</strong>
              </span>
              <Streak label="Racha actual" value={e.currentStreak} />
              <Streak label="Mejor racha" value={e.bestStreak} />
              <span className="text-xs text-white/70">
                Puntos: <strong className="font-mono text-reto-cream">{e.points}</strong>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

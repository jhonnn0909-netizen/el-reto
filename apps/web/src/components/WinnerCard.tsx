// Tarjeta del ganador (mejora 3): resultado, marcador, nombres,
// logo, fecha y botones para compartir (WhatsApp, Facebook, copiar).
'use client';

import Logo from './Logo';
import ShareButtons from './ShareButtons';
import Confetti from './Confetti';
import { CelebrationVideo, TrophyPhoto } from './Hands';
import Sparkles from './Sparkles';
import { getPrefs } from '../lib/session';
import { formatDateTime, formatScore } from '../lib/format';

export default function WinnerCard({
  winnerName,
  loserName,
  scoreWinner,
  scoreLoser,
  formatLabel,
  matchId,
  finishedAt,
  isWinner,
  /** Empate (sin ganador): no hay trofeo ni «¡X ganó!» — solo el
   * empate. Antes la página pasaba al jugador 2 como ganador cuando
   * winnerId era null y la tarjeta contradecía el empate. */
  isDraw = false,
  /** Nota del motivo de cierre (abandono, tiempo): se muestra bajo
   * el titular cuando la partida terminó por esa causa. */
  finishNote,
}: {
  winnerName: string;
  loserName: string;
  scoreWinner: number;
  scoreLoser: number;
  formatLabel: string;
  matchId: string;
  finishedAt: string;
  /** Si el usuario actual es el ganador (para el titular). */
  isWinner: boolean;
  isDraw?: boolean;
  finishNote?: string;
}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://elreto.app';
  const url = `${origin}/partidas/${matchId}`;
  const text = isDraw
    ? `Empatamos ${formatScore(scoreWinner, scoreLoser)} con ${loserName} en El Reto. ¿Aceptas el reto?`
    : isWinner
      ? `¡Gané ${formatScore(scoreWinner, scoreLoser)} a ${loserName} en El Reto! ¿Aceptas el reto?`
      : `${winnerName} ganó ${formatScore(scoreWinner, scoreLoser)} a ${loserName} en El Reto. ¿Aceptas el reto?`;

  return (
    <article
      aria-label="Tarjeta del ganador"
      className="relative overflow-hidden rounded-panel border border-reto-gold/50 bg-gradient-to-b from-reto-surface to-reto-elevated p-6 text-center shadow-xl"
    >
      {/* Vídeo de celebración como fondo + rayos y destellos dorados. */}
      <div aria-hidden="true" className="absolute inset-0 opacity-40">
        <CelebrationVideo className="h-full w-full rounded-none border-0 object-cover" />
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
      <Sparkles density="dense" />
      <div aria-hidden="true" className="energy-rays animate-rays-spin pointer-events-none absolute -inset-24 opacity-60" />
      {isWinner && !getPrefs().disableConfetti && <Confetti />}
      <div className="relative">
      <div className="flex justify-center">
        <Logo size={64} animated={false} />
      </div>
      {!isDraw && (
        <div className="mt-4">
          <TrophyPhoto caption="El trofeo del ganador" />
        </div>
      )}
      <h2 className="gold-text mt-4 font-display text-2xl font-black">
        {isDraw ? 'Empate' : isWinner ? '¡Ganaste la partida!' : `¡${winnerName} ganó la partida!`}
      </h2>
      {finishNote && (
        <p className="mt-1 text-sm font-semibold text-reto-warning">{finishNote}</p>
      )}
      <p className="mt-1 text-sm text-white/60">
        {winnerName} contra {loserName} · {formatLabel}
      </p>
      <p className="mt-3 font-display text-5xl font-black text-reto-gold" aria-label={`Marcador final ${scoreWinner} a ${scoreLoser}`}>
        {formatScore(scoreWinner, scoreLoser)}
      </p>
      <p className="mt-2 text-xs text-white/50">{formatDateTime(finishedAt)}</p>
      <div className="mt-5 flex justify-center">
        <ShareButtons url={url} text={text} label="Compartir resultado" />
      </div>
      </div>
    </article>
  );
}

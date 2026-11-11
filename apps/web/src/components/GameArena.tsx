// Arena de la partida en vivo (DESIGN.md §9): marcador, zona del
// rival con «Jugada sellada», zona propia con las tres manos como
// botones grandes (mínimo 72 px), cuenta atrás, resultado de ronda,
// indicador de conexión, revancha y mensajes rápidos (mejora 7).
// Modo espectador (mejora 5): solo lectura, sin botones de jugada.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Match, MatchMessage, Move } from '../lib/types';
import { FORMAT_LABELS, MOVE_LABELS, MOVE_ORDER, roundPhrase, roundPhraseNeutral, totalRoundsLabel, winnerOf } from '../lib/game';
import { formatScore } from '../lib/format';
import { playSound, vibrateLose, vibrateWin } from '../lib/sounds';
import { getPrefs } from '../lib/session';
import Countdown from './Countdown';
import Confetti from './Confetti';
import { CelebrationVideo, Hand, RevealVideo, ShakeVideo } from './Hands';
import Sparkles from './Sparkles';
import ConnectionIndicator, { type ConnectionStatus } from './ConnectionIndicator';
import { Button } from './ui';
import { QUICK_MESSAGES } from '../lib/types';

export interface RoundResult {
  myMove: Move;
  rivalMove: Move;
}

export default function GameArena({
  match,
  meId,
  meName,
  opponentName,
  connection,
  spectator = false,
  rivalSealed = false,
  roundResult = null,
  messages = [],
  onMove,
  onNextRound,
  onRematch,
  onLeave,
  onSendMessage,
  everConnected = true,
  /** La partida espera a un rival real (reto diario): el rival
   * provisional es el usuario de sistema, que nunca juega. */
  waitingForRealOpponent = false,
  /** La última ronda se resolvió por tiempo (un lado no jugó). */
  roundTimeout = null,
}: {
  match: Match;
  meId: string;
  meName: string;
  opponentName: string;
  connection: ConnectionStatus;
  spectator?: boolean;
  rivalSealed?: boolean;
  roundResult?: RoundResult | null;
  messages?: MatchMessage[];
  /** Envía la jugada y devuelve true solo si el servidor la aceptó.
   * La arena NO marca la jugada como sellada antes de esa
   * confirmación: antes se sellaba optimistamente al pulsar y, si el
   * envío fallaba, los botones quedaban escondidos sin reintento. */
  onMove: (move: Move) => Promise<boolean>;
  onNextRound?: () => void;
  onRematch: () => void;
  onLeave: () => void;
  onSendMessage?: (text: string) => void;
  /**
   * Si aún no se ha conectado nunca (primera carga), no se muestra el
   * aviso de «partida en pausa»: solo aparece cuando se pierde una
   * conexión que ya existía.
   */
  everConnected?: boolean;
  waitingForRealOpponent?: boolean;
  roundTimeout?: { winnerIsMe: boolean; winnerName: string } | null;
}) {
  const [phase, setPhase] = useState<'countdown' | 'play' | 'sealed' | 'revealed'>('countdown');
  const [myMove, setMyMove] = useState<Move | null>(null);
  const [sending, setSending] = useState(false);
  const [announce, setAnnounce] = useState('');

  const amPlayer1 = match.player1Id === meId;
  const myScore = amPlayer1 ? match.score1 : match.score2;
  const rivalScore = amPlayer1 ? match.score2 : match.score1;
  // Espectador: orientación neutra por jugador 1/2. Antes el espectador
  // caía en la rama «no soy jugador 1» y el marcador se mostraba
  // invertido respecto a los nombres (el jugador 1 con el marcador
  // del jugador 2 y viceversa).
  const leftName = spectator ? match.player1Username ?? 'Jugador 1' : meName;
  const leftScore = spectator ? match.score1 : myScore;
  const rightName = spectator ? match.player2Username ?? 'Jugador 2' : opponentName;
  const rightScore = spectator ? match.score2 : rivalScore;
  const winnerName =
    match.winnerId === match.player1Id
      ? match.player1Username ?? 'Jugador 1'
      : match.player2Username ?? 'Jugador 2';
  const finished = match.status === 'FINISHED';
  // Partida cancelada (por tiempo sin jugadas o por el rival): no es
  // «en vivo» ni está terminada con ganador; se muestra como tal y
  // los botones de jugada quedan desactivados (defecto 2, ronda 3).
  const cancelled = match.status === 'CANCELLED';
  const iWon = finished && !spectator && match.winnerId === meId;
  const roundLabel =
    match.format === 'FREE'
      ? `Ronda ${match.currentRound}`
      : `Ronda ${match.currentRound} de ${match.format === 'BEST_OF_1' ? 1 : match.format === 'BEST_OF_3' ? 3 : 5}`;

  // Nueva ronda: vuelve la cuenta atrás.
  useEffect(() => {
    if (!finished) {
      setPhase('countdown');
      setMyMove(null);
    }
  }, [match.currentRound, finished]);

  useEffect(() => {
    if (roundResult) {
      setPhase('revealed');
      // Espectador: anuncio neutro con el nombre del ganador de la
      // ronda. Antes decía «Ganas»/«Pierdes la ronda» a quien no juega
      // (roundResult.myMove es la jugada del jugador 1 para el
      // espectador, por la orientación neutra de la página).
      const phrase = spectator
        ? roundPhraseNeutral(
            roundResult.myMove,
            roundResult.rivalMove,
            match.player1Username ?? 'Jugador 1',
            match.player2Username ?? 'Jugador 2',
          )
        : roundPhrase(roundResult.myMove, roundResult.rivalMove);
      setAnnounce(phrase);
      // Sonidos y vibración solo para quien juega: al espectador no le
      // corresponde feedback de victoria/derrota.
      if (!spectator) {
        playSound('win');
        if (match.winnerId === meId) vibrateWin();
        else if (match.winnerId) vibrateLose();
      }
    }
  }, [roundResult, match.winnerId, meId, spectator, match.player1Username, match.player2Username]);

  useEffect(() => {
    if (!finished) return;
    // Empate (sin ganador): ni «Ganaste» ni «Perdiste» — antes el
    // jugador que no ganó leía «Perdiste 0 a 0» y la tarjeta del
    // ganador decía a la vez «¡X ganó la partida!», aunque otra parte
    // de la página decía «Empate». Un empate solo muestra empate.
    if (!match.winnerId) {
      setAnnounce('La partida terminó en empate.');
      return;
    }
    // Espectador: texto neutro con el ganador. Antes decía «Perdiste»
    // a quien ni siquiera había jugado (iWon era false para todo el
    // que no fuera el ganador).
    if (spectator) {
      setAnnounce(`Ganó ${winnerName} ${formatScore(match.score1, match.score2)}.`);
      return;
    }
    setAnnounce(iWon ? `¡Ganaste ${myScore} a ${rivalScore}!` : `Perdiste ${myScore} a ${rivalScore}.`);
    if (iWon) {
      playSound('win');
      vibrateWin();
    } else {
      playSound('lose');
      vibrateLose();
    }
  }, [finished, iWon, myScore, rivalScore, spectator, winnerName, match.score1, match.score2, match.winnerId]);

  // Teclas 1/2/3 eligen piedra/papel/tijera (anunciado en pantalla).
  useEffect(() => {
    if (spectator || finished || cancelled || waitingForRealOpponent) return;
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'play' || sending) return;
      const idx = ['1', '2', '3'].indexOf(e.key);
      if (idx >= 0) void choose(MOVE_ORDER[idx]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, spectator, finished, waitingForRealOpponent, sending]);

  /** Solo se marca la jugada como sellada cuando el servidor la
   * acepta (onMove devuelve true). Si el envío falla, los botones
   * siguen disponibles para reintentar. */
  async function choose(move: Move) {
    if (phase !== 'play' || spectator || sending || waitingForRealOpponent) return;
    setSending(true);
    playSound('move');
    const ok = await onMove(move);
    setSending(false);
    if (ok) {
      setMyMove(move);
      setPhase('sealed');
    }
  }

  const showConfetti = finished && iWon && !getPrefs().disableConfetti;

  return (
    <section aria-label="Partida en vivo" className="relative flex flex-col gap-4 overflow-hidden rounded-panel">
      {/* Brillo dorado, rayos de energía y destellos detrás de la arena (negro y oro). */}
      <div aria-hidden="true" className="arena-glow pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="energy-rays animate-rays-spin pointer-events-none absolute -inset-24 opacity-60" />
      <Sparkles density="ambient" />
      <div className="relative flex flex-col gap-4">
      {showConfetti && <Confetti />}
      <p aria-live="polite" className="sr-only">
        {announce ||
          (spectator
            ? `${roundLabel}. ${leftName} ${leftScore} a ${rightScore} ${rightName}.`
            : `${roundLabel}. Vas ${myScore} a ${rivalScore}.`)}
      </p>

      {/* Barra de partida */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-reto-gold/40 bg-reto-surface px-4 py-3">
        <Button variant="secondary" onClick={onLeave}>
          Salir
        </Button>
        {match.status === 'IN_PROGRESS' && (
          <span className="animate-badge-pulse rounded-full bg-gradient-to-b from-reto-goldLight to-reto-gold px-2.5 py-1 text-[11px] font-bold text-[#1a1206]">
            ● EN VIVO
          </span>
        )}
        <span className="rounded-full bg-reto-elevated px-3 py-1 text-xs font-semibold text-reto-gold">
          {FORMAT_LABELS[match.format]}
        </span>
        <span className="text-sm font-semibold">{roundLabel}</span>
        <ConnectionIndicator status={connection} />
      </div>

      {spectator && (
        <div role="note" className="rounded-card border border-reto-info/50 bg-reto-info/10 px-4 py-3 text-sm">
          Estás viendo esta partida como espectador. No puedes jugar en ella.
        </div>
      )}
      {waitingForRealOpponent && !finished && !cancelled && (
        <div role="status" className="rounded-card border border-reto-warning/50 bg-reto-warning/10 px-4 py-3 text-sm">
          <p className="font-semibold">Esperando a un rival real.</p>
          <p className="mt-1 text-white/70">
            El reto diario espera a que otra persona se una. En cuanto alguien acepte, podrás jugar.
          </p>
        </div>
      )}
      {cancelled && (
        <div role="alert" className="rounded-card border border-reto-warning/50 bg-reto-warning/10 px-4 py-3 text-sm">
          <p className="font-semibold">Partida cancelada.</p>
          <p className="mt-1 text-white/70">
            Se acabó el tiempo sin jugadas, así que la partida se canceló y no cuenta como victoria ni derrota.
            Tus créditos reservados, si los había, se devolvieron a tu billetera.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/retos">
              <Button variant="secondary">Ver retos</Button>
            </Link>
            <Link href="/retos/crear">
              <Button>Crear un reto nuevo</Button>
            </Link>
          </div>
        </div>
      )}
      {everConnected && connection !== 'connected' && !finished && (
        <div role="alert" className="rounded-card border border-reto-warning/50 bg-reto-warning/10 px-4 py-3 text-sm">
          Esperando conexión… La partida queda en pausa, no se declara ninguna derrota.
        </div>
      )}

      {/* Marcador */}
      <div className="flex items-center justify-between gap-3 rounded-panel border border-reto-gold/40 bg-reto-surface p-4 text-center">
        <div className="flex-1">
          <p className="truncate text-sm font-semibold">{leftName}</p>
          <p className="font-display text-3xl font-black text-reto-gold" aria-label={spectator ? `Marcador de ${leftName}: ${leftScore}` : `Tu marcador: ${myScore}`}>
            {leftScore}
          </p>
        </div>
        <span aria-hidden="true" className="font-display text-xl font-black text-white/40">VS</span>
        <div className="flex-1">
          <p className="truncate text-sm font-semibold">{rightName}</p>
          <p className="font-display text-3xl font-black text-reto-gold" aria-label={spectator ? `Marcador de ${rightName}: ${rightScore}` : `Marcador del rival: ${rivalScore}`}>
            {rightScore}
          </p>
        </div>
      </div>
      <p className="text-center text-xs text-white/50">{totalRoundsLabel(match.format)}</p>

      {/* Vídeo de manos reales: se sacude en la cuenta atrás y en la espera de jugada */}
      {!finished && !cancelled && !roundResult && (
        <div className="mx-auto w-full max-w-[420px]">
          <ShakeVideo />
        </div>
      )}

      {/* Cuenta atrás (con el vídeo de manos sacudiéndose encima) */}
      {phase === 'countdown' && !finished && !cancelled && (
        <div className="py-2">
          <Countdown onDone={() => setPhase('play')} />
        </div>
      )}

      {/* Zona del rival */}
      <div className="rounded-card border border-reto-gold/40 bg-reto-surface p-4 text-center">
        <h2 className="text-sm font-semibold text-white/70">{spectator ? match.player2Username ?? 'Rival' : opponentName}</h2>
        <div className="mt-2 flex min-h-[90px] items-center justify-center">
          {roundResult ? (
            <div className="relative mx-auto w-full max-w-[280px]">
              {winnerOf(roundResult.myMove, roundResult.rivalMove) === -1 && (
                <div aria-hidden="true" className="energy-rays animate-rays-spin pointer-events-none absolute -inset-8 opacity-60" />
              )}
              <div
                className={`relative ${winnerOf(roundResult.myMove, roundResult.rivalMove) === -1 ? 'rounded-xl ring-2 ring-reto-gold' : ''}`}
              >
                <RevealVideo move={roundResult.rivalMove} mirrored />
              </div>
              {winnerOf(roundResult.myMove, roundResult.rivalMove) === -1 && (
                <p className="mt-2 text-sm font-bold text-reto-gold">Gana la ronda</p>
              )}
            </div>
          ) : finished ? (
            // Empate visible también aquí: antes decía «Partida
            // terminada.» y el título «Empate» quedaba solo en la
            // tarjeta final.
            <p className="text-sm text-white/60">
              {!match.winnerId ? 'La partida terminó en empate.' : 'Partida terminada.'}
            </p>
          ) : cancelled ? (
            <p className="text-sm text-white/60">Partida cancelada.</p>
          ) : (
            <p className="text-sm text-white/60">
              {rivalSealed ? 'Jugada sellada' : 'Esperando a tu rival…'}
            </p>
          )}
        </div>
        {rivalSealed && !roundResult && (
          <p className="mt-1 flex items-center justify-center gap-1 text-sm font-semibold text-reto-warning">
            <span aria-hidden="true">🔒</span> Jugada sellada
          </p>
        )}
        {/* «Esperando a tu rival…» nunca en una partida terminada ni cancelada. */}
        {!finished && !cancelled && !rivalSealed && !roundResult && phase !== 'countdown' && (
          <p className="mt-1 text-sm text-white/60">
            {waitingForRealOpponent ? 'Esperando a un rival real…' : 'Esperando a tu rival…'}
          </p>
        )}
      </div>

      {/* Zona propia */}
      {!spectator && !finished && !cancelled && (
        <div className="rounded-card border border-reto-gold/40 bg-reto-surface p-4 text-center">
          <h2 className="text-sm font-semibold text-white/70">Tu jugada</h2>
          {phase === 'sealed' || roundResult ? (
            <div className="mt-2">
              {myMove && roundResult ? (
                <div className="relative mx-auto w-full max-w-[280px]">
                  {winnerOf(roundResult.myMove, roundResult.rivalMove) === 1 && (
                    <div aria-hidden="true" className="energy-rays animate-rays-spin pointer-events-none absolute -inset-8 opacity-60" />
                  )}
                  <div
                    className={`relative ${winnerOf(roundResult.myMove, roundResult.rivalMove) === 1 ? 'rounded-xl ring-2 ring-reto-gold' : ''}`}
                  >
                    <RevealVideo move={myMove} />
                  </div>
                  {winnerOf(roundResult.myMove, roundResult.rivalMove) === 1 && (
                    <p className="mt-2 text-sm font-bold text-reto-gold">Gana la ronda</p>
                  )}
                </div>
              ) : (
                myMove && <Hand move={myMove} size={84} />
              )}
              <p className="mt-2 text-sm font-semibold text-reto-gold">Tu jugada está sellada</p>
            </div>
          ) : (
            <div className="mt-3 flex items-start justify-center gap-4" role="group" aria-label="Elige tu jugada">
              {MOVE_ORDER.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => void choose(m)}
                  disabled={phase !== 'play' || sending || waitingForRealOpponent}
                  aria-label={`${MOVE_LABELS[m]} (tecla ${i + 1})`}
                  className="flex min-h-[72px] min-w-[72px] flex-col items-center gap-1 rounded-panel border border-white/15 bg-reto-elevated p-2 transition hover:border-reto-gold focus-visible:outline-2 focus-visible:outline-reto-gold disabled:opacity-60"
                >
                  <Hand move={m} size={64} />
                  <span className="text-xs font-semibold">{MOVE_LABELS[m]}</span>
                </button>
              ))}
            </div>
          )}
          {sending && (
            <p className="mt-2 text-sm text-white/70" role="status">Enviando tu jugada…</p>
          )}
          <p className="mt-3 text-xs text-white/50">
            Pulsa una mano o usa las teclas 1, 2 y 3 para piedra, papel y tijera.
          </p>
        </div>
      )}

      {/* Resultado de la ronda: rayos dorados al revelar la jugada */}
      {roundResult && !finished && (
        <div className="relative overflow-hidden rounded-card border border-reto-gold/40 bg-reto-gold/10 p-4 text-center" aria-live="polite">
          <div aria-hidden="true" className="energy-rays animate-rays-spin pointer-events-none absolute -inset-24 opacity-50" />
          <div className="relative">
          {/* Espectador: frase neutra con el ganador de la ronda. */}
          <p className="font-display text-lg font-bold">
            {spectator
              ? roundPhraseNeutral(
                  roundResult.myMove,
                  roundResult.rivalMove,
                  match.player1Username ?? 'Jugador 1',
                  match.player2Username ?? 'Jugador 2',
                )
              : roundPhrase(roundResult.myMove, roundResult.rivalMove)}
          </p>
          {roundTimeout && (
            <p className="mt-1 text-sm font-semibold text-reto-warning">
              {spectator
                ? `La ronda se resolvió por tiempo: ganó ${roundTimeout.winnerName}.`
                : roundTimeout.winnerIsMe
                  ? 'Tu rival no jugó a tiempo: ganas la ronda.'
                  : 'No jugaste a tiempo: pierdes la ronda.'}
            </p>
          )}
          <p className="mt-1 text-sm text-white/70">
            Marcador: {formatScore(leftScore, rightScore)}
          </p>
          {onNextRound && (
            <Button className="mt-3" onClick={onNextRound}>
              Siguiente ronda
            </Button>
          )}
          </div>
        </div>
      )}

      {/* Ronda resuelta por tiempo (un solo jugador jugó): no hay dos
        jugadas que revelar, así que no hay tarjeta de resultado de
        ronda; se muestra el motivo directamente. */}
      {roundTimeout && !roundResult && !finished && !cancelled && (
        <div className="rounded-card border border-reto-warning/50 bg-reto-warning/10 p-4 text-center" aria-live="polite">
          <p className="font-display text-lg font-bold">
            {spectator
              ? `La ronda se resolvió por tiempo: ganó ${roundTimeout.winnerName}.`
              : roundTimeout.winnerIsMe
                ? 'Tu rival no jugó a tiempo: ganas la ronda.'
                : 'No jugaste a tiempo: pierdes la ronda.'}
          </p>
          <p className="mt-1 text-sm text-white/70">
            Marcador: {formatScore(leftScore, rightScore)}
          </p>
          {onNextRound && (
            <Button className="mt-3" onClick={onNextRound}>
              Siguiente ronda
            </Button>
          )}
        </div>
      )}

      {/* Mensajes rápidos */}
      {onSendMessage && !finished && !cancelled && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Mensajes rápidos</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Mensajes rápidos">
            {QUICK_MESSAGES.map((msg) => (
              <button
                key={msg}
                type="button"
                onClick={() => onSendMessage(msg)}
                className="min-h-[44px] rounded-full border border-white/15 bg-reto-elevated px-3 py-1.5 text-sm hover:border-reto-gold"
              >
                {msg}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Burbujas de mensajes */}
      {messages.length > 0 && (
        <ul aria-live="polite" className="flex flex-col gap-2">
          {messages.slice(-5).map((m) => (
            <li
              key={m.id}
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.playerId === meId ? 'self-end bg-reto-gold/40' : 'self-start bg-reto-elevated'
              }`}
            >
              <strong className="mr-1 text-xs text-white/60">{m.playerName}:</strong>
              {m.text}
            </li>
          ))}
        </ul>
      )}

      {!cancelled && (
        <p className="text-center text-xs text-white/50">
          Ninguno ve la jugada del otro hasta que los dos han elegido.
        </p>
      )}

      {/* Final de la partida */}
      {finished && (
        <div className="relative overflow-hidden rounded-card border border-reto-gold/40 bg-reto-surface p-5 text-center" aria-live="assertive">
          {/* Vídeo de celebración como fondo + destellos dorados densos */}
          <div aria-hidden="true" className="absolute inset-0 opacity-40">
            <CelebrationVideo className="h-full w-full rounded-none border-0 object-cover" />
          </div>
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
          <Sparkles density="dense" />
          <div aria-hidden="true" className="energy-rays animate-rays-spin pointer-events-none absolute -inset-24 opacity-50" />
          <div className="relative">
          <h2 className="gold-text font-display text-2xl font-black">
            {!match.winnerId
              ? 'Empate'
              : spectator
                ? `Ganó ${winnerName} ${formatScore(match.score1, match.score2)}`
                : iWon
                  ? `¡Ganaste ${formatScore(myScore, rivalScore)}!`
                  : `Perdiste ${formatScore(myScore, rivalScore)}`}
          </h2>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={onRematch}>Revancha</Button>
            <Link href="/retos">
              <Button variant="secondary">Volver a retos</Button>
            </Link>
          </div>
          </div>
        </div>
      )}
      </div>
    </section>
  );
}

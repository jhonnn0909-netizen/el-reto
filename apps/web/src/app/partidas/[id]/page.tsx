// Partida en vivo (DESIGN.md §9 + mejoras 3, 5 y 7): GameArena con
// WebSocket (match:join / match:watch, match:message) y REST como
// respaldo (poll cada 3 s si el WS falla). Espectador: solo lectura.
// Al terminar: WinnerCard con compartir + invitación suave a registrarse.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { gameApi } from '../../../lib/auth';
import { apiErrorMessage } from '../../../lib/useApi';
import { getAccessToken } from '../../../lib/api';
import { disconnectGameSocket, getGameSocket } from '../../../lib/ws';
import { getStoredUser, isGuestUser } from '../../../lib/session';
import { commitHash, randomSecret } from '../../../lib/game';
import { FORMAT_LABELS } from '../../../lib/game';
import type { Match, MatchMessage, Move, OnlinePerson, User } from '../../../lib/types';
import GameArena, { type RoundResult } from '../../../components/GameArena';
import OnlinePanel from '../../../components/OnlinePanel';
import WinnerCard from '../../../components/WinnerCard';
import Modal from '../../../components/Modal';
import Toast from '../../../components/Toast';
import { ListSkeleton } from '../../../components/Spinner';
import { Button, PageHeader } from '../../../components/ui';
import type { ConnectionStatus } from '../../../components/ConnectionIndicator';

export default function MatchPage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('reconnecting');
  const [rivalSealed, setRivalSealed] = useState(false);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [dismissedInvite, setDismissedInvite] = useState(false);
  const [presence, setPresence] = useState<OnlinePerson[]>([]);
  const secretRef = useRef<string>(randomSecret());
  const socketRef = useRef<ReturnType<typeof getGameSocket> | null>(null);

  const load = useCallback(async () => {
    try {
      const m = await gameApi.getMatch(id);
      setMatch(m);
      setStatus('ok');
      return m;
    } catch (err) {
      setError(apiErrorMessage(err));
      setStatus('error');
      return null;
    }
  }, [id]);

  useEffect(() => {
    setUser(getStoredUser());
    void load();
    gameApi.presence().then(setPresence).catch(() => setPresence([]));
  }, [load]);

  // WebSocket con respaldo REST.
  useEffect(() => {
    if (!match || !user) return;
    const token = getAccessToken();
    let poll: ReturnType<typeof setInterval> | undefined;
    let socket: ReturnType<typeof getGameSocket> | null = null;
    try {
      if (token) {
        socket = getGameSocket(token);
        socketRef.current = socket;
        const spectator = match.player1Id !== user.id && match.player2Id !== user.id;
        socket.emit(spectator ? 'match:watch' : 'match:join', { matchId: id });
        socket.on('connect', () => setConnection('connected'));
        socket.on('disconnect', () => setConnection('reconnecting'));
        socket.on('connect_error', () => setConnection('offline'));
        socket.on('match:state', (state: Match) => {
          setMatch(state);
          setConnection('connected');
        });
        socket.on('match:committed', (payload: { playerId: string }) => {
          if (payload.playerId !== user.id) setRivalSealed(true);
        });
        socket.on('round:result', (payload: { moves: { [k: string]: Move }; result: string; score: { score1: number; score2: number } }) => {
          const myMove = payload.moves[user.id];
          const rivalId = match.player1Id === user.id ? match.player2Id : match.player1Id;
          const rivalMove = payload.moves[rivalId];
          if (myMove && rivalMove) {
            setRoundResult({ myMove, rivalMove });
            setRivalSealed(false);
          }
          setMatch((prev) => (prev ? { ...prev, score1: payload.score.score1, score2: payload.score.score2 } : prev));
        });
        socket.on('match:finished', (payload: { winnerId: string; score: { score1: number; score2: number } }) => {
          setMatch((prev) =>
            prev ? { ...prev, status: 'FINISHED', winnerId: payload.winnerId, score1: payload.score.score1, score2: payload.score.score2 } : prev,
          );
        });
        socket.on('match:message', (msg: MatchMessage) => {
          setMessages((prev) => [...prev, msg]);
        });
        socket.on('match:cancelled', () => {
          setToast('Tu rival se desconectó. Puedes esperar o cancelar el reto.');
        });
      }
    } catch {
      setConnection('offline');
    }
    if (connection === 'offline') {
      poll = setInterval(() => void load(), 3000);
    }
    return () => {
      if (poll) clearInterval(poll);
      socket?.off('match:state');
      socket?.off('match:committed');
      socket?.off('round:result');
      socket?.off('match:finished');
      socket?.off('match:message');
      socket?.off('match:cancelled');
      disconnectGameSocket();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, user?.id, connection === 'offline']);

  async function chooseMove(move: Move) {
    if (!match || !user) return;
    const secret = secretRef.current;
    try {
      const hash = await commitHash(move, secret);
      await gameApi.commit(match.id, match.currentRound, hash);
      socketRef.current?.emit('match:commit', { matchId: match.id, round: match.currentRound, commitHash: hash });
      await gameApi.reveal(match.id, match.currentRound, move, secret);
      socketRef.current?.emit('match:reveal', { matchId: match.id, round: match.currentRound, move, secret });
      secretRef.current = randomSecret();
      await load();
    } catch {
      setToast('No pudimos enviar tu jugada. Revisa tu conexión e inténtalo de nuevo.');
    }
  }

  function sendMessage(text: string) {
    if (!match || !user) return;
    socketRef.current?.emit('match:message', { matchId: match.id, text });
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, matchId: match.id, playerId: user.id, playerName: user.displayName, text, createdAt: new Date().toISOString() },
    ]);
  }

  async function rematch() {
    if (!match) return;
    try {
      const challenge = await gameApi.createChallenge({
        visibility: 'PUBLIC',
        format: match.format,
        stakeCredits: 0,
      });
      router.push(`/retos/${challenge.id}`);
    } catch {
      setToast('No pudimos crear la revancha. Inténtalo de nuevo.');
    }
  }

  function leave() {
    if (match?.status === 'IN_PROGRESS') {
      setConfirmLeave(true);
      return;
    }
    router.push('/retos');
  }

  if (status === 'loading' || !match) {
    return (
      <div className="mx-auto max-w-2xl">
        <ListSkeleton count={3} />
      </div>
    );
  }
  if (status === 'error' || !user) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Partida no disponible" />
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">{error ?? 'Inicia sesión para ver esta partida.'}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>Reintentar</Button>
            <Link href="/retos"><Button variant="secondary">Ver retos</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  const spectator = match.player1Id !== user.id && match.player2Id !== user.id;
  const opponentId = match.player1Id === user.id ? match.player2Id : match.player1Id;
  const opponentName = spectator
    ? 'Rival'
    : match.player1Id === user.id
      ? match.player2Username ?? 'Rival'
      : match.player1Username ?? 'Rival';
  const finished = match.status === 'FINISHED';
  const guest = isGuestUser(user);

  return (
    // Organización v7 (APROBADA): contenido centrado (máx. 1.080 px,
    // columna central máx. 660 px); el panel en línea (200 px) va a un
    // lado en escritorio y fijo arriba en el teléfono (OnlinePanel).
    <div className="mx-auto w-full max-w-[1080px] min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_200px] min-[900px]:items-start min-[900px]:gap-7">
      <OnlinePanel people={presence} />
      <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4 min-[900px]:col-start-1 min-[900px]:row-start-1">
      <Toast message={toast} onClose={() => setToast(null)} />
      <GameArena
        match={match}
        meId={user.id}
        meName={user.displayName}
        opponentName={opponentName}
        connection={connection}
        spectator={spectator}
        rivalSealed={rivalSealed}
        roundResult={roundResult}
        messages={messages}
        onMove={chooseMove}
        onNextRound={() => {
          setRoundResult(null);
          setRivalSealed(false);
          void load();
        }}
        onRematch={rematch}
        onLeave={leave}
        onSendMessage={spectator ? undefined : sendMessage}
      />

      {finished && (
        <WinnerCard
          winnerName={
            match.winnerId === match.player1Id
              ? match.player1Username ?? 'Jugador 1'
              : match.player2Username ?? 'Jugador 2'
          }
          loserName={
            match.winnerId === match.player1Id
              ? match.player2Username ?? 'Jugador 2'
              : match.player1Username ?? 'Jugador 1'
          }
          scoreWinner={Math.max(match.score1, match.score2)}
          scoreLoser={Math.min(match.score1, match.score2)}
          formatLabel={FORMAT_LABELS[match.format]}
          matchId={match.id}
          finishedAt={match.finishedAt ?? new Date().toISOString()}
          isWinner={match.winnerId === user.id}
        />
      )}

      {finished && guest && !dismissedInvite && (
        <div className="rounded-card border border-reto-gold/40 bg-reto-gold/10 p-4">
          <p className="text-sm font-semibold">Guarda tu nombre y tu ranking creando una cuenta.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/registro"><Button>Crear cuenta</Button></Link>
            <Button variant="secondary" onClick={() => setDismissedInvite(true)}>Ahora no</Button>
          </div>
        </div>
      )}

      {confirmLeave && (
        <Modal
          title="¿Salir de la partida?"
          confirmLabel="Sí, salir"
          onConfirm={() => {
            setConfirmLeave(false);
            router.push('/retos');
          }}
          onCancel={() => setConfirmLeave(false)}
          danger
        >
          <p>La partida quedará sin terminar y puede contarse como abandono.</p>
        </Modal>
      )}
      <p className="hidden">{opponentId}</p>
      </div>
    </div>
  );
}

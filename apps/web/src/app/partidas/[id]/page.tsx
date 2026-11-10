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
import { clearStoredUser, getStoredUser, isGuestUser } from '../../../lib/session';
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
  const [everConnected, setEverConnected] = useState(false);
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
      // Defensa: un estado incompleto no debe romper el render; se
      // trata como error de carga (con reintento) en vez de página negra.
      if (!m || typeof m !== 'object' || !m.id || !m.player1Id || !m.player2Id || !m.format) {
        throw new Error('La partida no devolvió un estado válido.');
      }
      setMatch(m);
      setStatus('ok');
      return m;
    } catch (err) {
      // Sesión caducada (el refresco ya falló dentro de apiFetch y los
      // tokens están borrados): no hay sesión válida, así que la página
      // muestra el aviso de inicio de sesión en vez de reintentar en vano.
      if ((err as { status?: number })?.status === 401) {
        clearStoredUser();
        setUser(null);
      }
      setError(apiErrorMessage(err));
      setStatus('error');
      return null;
    }
  }, [id]);

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
    // Sin sesión no hay partida que cargar: se muestra directamente el
    // aviso de inicio de sesión (antes se intentaba la petición, que
    // fallaba, y la página se quedaba en "Cargando contenido").
    if (!stored) {
      setError('Inicia sesión para ver o jugar esta partida.');
      setStatus('error');
      return;
    }
    void load();
    gameApi.presence().then(setPresence).catch(() => setPresence([]));
  }, [load]);

  // La lista de personas en línea se refresca cada 20 s (igual que el
  // latido de presencia que envía el panel).
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => {
      gameApi.presence().then(setPresence).catch(() => undefined);
    }, 20000);
    return () => clearInterval(timer);
  }, [user]);

  // Recarga inmediata tras cada latido de presencia (OnlinePanel
  // avisa con 'elreto:presence').
  useEffect(() => {
    const refresh = () => {
      gameApi.presence().then(setPresence).catch(() => undefined);
    };
    window.addEventListener('elreto:presence', refresh);
    return () => window.removeEventListener('elreto:presence', refresh);
  }, []);

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
        // Al reconectar, el servidor ya no tiene este socket en la sala:
        // hay que volver a entrar para seguir recibiendo match:state
        // (antes, tras una reconexión, la página quedaba con el estado
        // viejo y no se enteraba de cancelaciones ni resultados).
        let joined = false;
        const joinRoom = () => {
          socket?.emit(spectator ? 'match:watch' : 'match:join', { matchId: id });
          joined = true;
        };
        joinRoom();
        socket.on('connect', () => {
          setConnection('connected');
          setEverConnected(true);
          if (joined) joinRoom();
        });
        socket.on('disconnect', () => setConnection('reconnecting'));
        socket.on('connect_error', () => setConnection('offline'));
        socket.on('match:state', (state: Match) => {
          // Defensa: un estado incompleto (p. ej. de una versión
          // anterior del servidor o un reenvío corrupto) no debe
          // romper el render: sin jugadores ni formato no hay partida
          // que mostrar. Se ignora y se conserva el estado anterior.
          if (!state || typeof state !== 'object' || !state.id || !state.player1Id || !state.player2Id || !state.format) {
            return;
          }
          setMatch(state);
          setConnection('connected');
          setEverConnected(true);
        });
        socket.on('match:committed', (payload: { playerId: string }) => {
          if (payload && payload.playerId && payload.playerId !== user.id) setRivalSealed(true);
        });
        // La API emite las jugadas y el marcador por jugador 1/2
        // (moves: {player1, player2}, score: {player1, player2}), no por
        // id de usuario ni como score1/score2. Antes se leía
        // payload.moves[user.id] y payload.score.score1, ambos undefined:
        // el resultado de la ronda nunca se mostraba y el marcador
        // quedaba en "NaN a NaN".
        socket.on('round:result', (payload: { moves: { player1: Move | null; player2: Move | null }; result: string; score: { player1: number; player2: number } }) => {
          // Defensa: el temporizador puede resolver una ronda con una
          // sola jugada (la otra es null) y un payload sin `score` o
          // sin `moves` rompería el render al leer
          // `payload.score.player1` dentro del actualizador de estado
          // (la excepción se propaga como error de renderizado: página
          // negra «Application error»). Sin datos completos se ignora
          // el evento; el estado se refresca con la siguiente
          // match:state o con el sondeo REST.
          if (!payload || typeof payload !== 'object' || !payload.moves || typeof payload.moves !== 'object') {
            return;
          }
          // Espectador: orientación neutra por jugador 1/2. Antes el
          // espectador caía en la rama «no soy jugador 1» y el vídeo
          // de la jugada se mostraba bajo el nombre equivocado.
          const isSpectator = match.player1Id !== user.id && match.player2Id !== user.id;
          const amPlayer1 = match.player1Id === user.id;
          const myMove = isSpectator || amPlayer1 ? payload.moves.player1 : payload.moves.player2;
          const rivalMove = isSpectator || amPlayer1 ? payload.moves.player2 : payload.moves.player1;
          if (myMove && rivalMove) {
            setRoundResult({ myMove, rivalMove });
            setRivalSealed(false);
          }
          if (payload.score && typeof payload.score.player1 === 'number' && typeof payload.score.player2 === 'number') {
            setMatch((prev) => (prev ? { ...prev, score1: payload.score.player1, score2: payload.score.player2 } : prev));
          }
        });
        socket.on('match:finished', (payload: { winnerId: string; score: { player1: number; player2: number } }) => {
          if (!payload || typeof payload !== 'object') return;
          setMatch((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'FINISHED',
                  winnerId: payload.winnerId ?? null,
                  score1: typeof payload.score?.player1 === 'number' ? payload.score.player1 : prev.score1,
                  score2: typeof payload.score?.player2 === 'number' ? payload.score.player2 : prev.score2,
                }
              : prev,
          );
        });
        socket.on('match:message', (msg: MatchMessage) => {
          setMessages((prev) => [...prev, msg]);
        });
        socket.on('match:cancelled', (payload: { matchId: string; reason?: string }) => {
          // La partida cancelada debe reflejarse EN EL MOMENTO: antes
          // solo se mostraba un aviso («Tu rival se desconectó») y la
          // página seguía como «Partida en vivo» con los botones
          // activos; al jugar, el commit fallaba con un error genérico
          // de conexión. Ahora se marca CANCELLED, se recarga el
          // estado fresco y los botones quedan desactivados (GameArena).
          void payload;
          setMatch((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
          setToast('La partida fue cancelada: se acabó el tiempo sin jugadas. Puedes crear un reto nuevo.');
          void load();
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
      // Se quitan TODOS los manejadores, incluidos connect/disconnect:
      // antes se acumulaban en el socket compartido al repetirse el
      // efecto y cada reconexión reenviaba match:join varias veces.
      socket?.off('connect');
      socket?.off('disconnect');
      socket?.off('connect_error');
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
    // Sin jugadas posibles en partidas cerradas: el botón ya está
    // desactivado (GameArena), pero un doble toque o una tecla 1/2/3
    // no debe intentar el commit (antes fallaba con el error genérico
    // de conexión aunque la causa era la cancelación por tiempo).
    if (match.status === 'CANCELLED') {
      setToast('Esta partida fue cancelada. Crea un reto nuevo para jugar.');
      return;
    }
    if (match.status === 'FINISHED') return;
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

  // El error va ANTES que la carga: antes, con status 'error' y sin
  // partida cargada, la rama de carga (condición `!match`) ganaba y la
  // página se quedaba en "Cargando contenido" para siempre, también
  // sin sesión. (La condición es solo status: el efecto ya deja
  // status en 'error' cuando no hay sesión, y en el primer render
  // `user` aún es null aunque la sesión exista.)
  if (status === 'error') {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title={user ? 'Partida no disponible' : 'Inicia sesión para jugar'} />
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">{error ?? 'Inicia sesión para ver esta partida.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!user ? (
              <>
                <Link href={`/login?next=/partidas/${id}`}><Button>Iniciar sesión</Button></Link>
                <Link href="/registro"><Button variant="secondary">Crear cuenta</Button></Link>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => void load()}>Reintentar</Button>
                <Link href="/retos"><Button variant="secondary">Ver retos</Button></Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (status === 'loading' || !match) {
    return (
      <div className="mx-auto max-w-2xl">
        <ListSkeleton count={3} />
      </div>
    );
  }
  // Red de seguridad (y estrechamiento de tipos): sin sesión el efecto
  // ya dejó status en 'error', así que aquí siempre hay usuario; si
  // llegara a no haberlo, se ofrece iniciar sesión en vez de romper.
  if (!user) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Inicia sesión para jugar" />
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">Inicia sesión para ver o jugar esta partida.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/login?next=/partidas/${id}`}><Button>Iniciar sesión</Button></Link>
            <Link href="/registro"><Button variant="secondary">Crear cuenta</Button></Link>
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
      <OnlinePanel people={presence} meId={user.id} />
      <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4 min-[900px]:col-start-1 min-[900px]:row-start-1">
      <Toast message={toast} onClose={() => setToast(null)} />
      <GameArena
        match={match}
        meId={user.id}
        meName={user.displayName}
        opponentName={opponentName}
        connection={connection}
        everConnected={everConnected}
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

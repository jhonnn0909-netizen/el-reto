// Área de juegos (DESIGN.md §9 + mejora: área de juegos): las 4
// tarjetas de juegos (GET /games), reto del día, personas en línea y
// retos públicos. Piedra, papel o tijera jugable; el resto, «Próximamente».
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gameApi } from '../../lib/auth';
import { asList, useApiData } from '../../lib/useApi';
import { getStoredUser } from '../../lib/session';
import { FORMAT_LABELS } from '../../lib/game';
import type { Challenge, DailyChallenge, Game, OnlinePerson, User } from '../../lib/types';
import { GameCard, DailyChallengeCard, FALLBACK_GAMES } from '../../components/GameCard';
import ChallengeCard from '../../components/ChallengeCard';
import OnlinePanel from '../../components/OnlinePanel';
import GuestNameForm from '../../components/GuestNameForm';
import EmptyState from '../../components/EmptyState';
import { ListSkeleton } from '../../components/Spinner';
import Toast from '../../components/Toast';
import ConnectionIndicator from '../../components/ConnectionIndicator';
import { Button, PageHeader, SectionTitle } from '../../components/ui';

export default function GamesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [daily, setDaily] = useState<DailyChallenge | null>(null);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [showGuest, setShowGuest] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    gameApi.dailyChallenge().then(setDaily).catch(() => setDaily(null));
  }, []);

  const games = useApiData<Game[]>(
    () => gameApi.games().then((r) => {
      const list = asList(r);
      return list.length > 0 ? list : FALLBACK_GAMES;
    }),
    'games-list',
  );
  const challenges = useApiData<Challenge[]>(
    useCallback(async () => asList(await gameApi.listChallenges({ limit: 6 })), []),
    'games-challenges',
  );
  const presence = useApiData<OnlinePerson[]>(
    useCallback(async () => gameApi.presence(), []),
    'games-presence',
    20000,
  );

  async function playDaily() {
    if (!daily) return;
    if (!getStoredUser()) {
      setShowGuest(true);
      return;
    }
    setDailyBusy(true);
    try {
      const match = await gameApi.acceptChallenge(daily.id);
      router.push(`/partidas/${match.id}`);
    } catch {
      setToast('No pudimos abrir el reto del día. Inténtalo de nuevo.');
    } finally {
      setDailyBusy(false);
    }
  }

  return (
    // Organización v7 (APROBADA): contenido centrado, máx. 1.080 px;
    // el panel en línea (200 px) va a un lado en escritorio y fijo
    // arriba en el teléfono (OnlinePanel, primero en el DOM).
    <div className="mx-auto w-full max-w-[1080px] min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_200px] min-[900px]:items-start min-[900px]:gap-7">
      <OnlinePanel
        people={presence.status === 'ok' ? presence.data ?? [] : []}
        loading={presence.status === 'loading'}
        meId={user?.id}
      />
      <div className="flex min-w-0 flex-col gap-6 min-[900px]:col-start-1 min-[900px]:row-start-1">
      <Toast message={toast} kind="error" onClose={() => setToast(null)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Jugar" subtitle="Elige un juego, crea un reto o acepta uno." />
        <ConnectionIndicator status="connected" />
      </div>

      {!user && !showGuest && (
        <GuestNameForm title="Tu nombre para jugar" onDone={(u) => setUser(u)} />
      )}
      {showGuest && (
        <GuestNameForm title="Tu nombre para el reto del día" onDone={async (u) => { setUser(u); setShowGuest(false); await playDaily(); }} />
      )}

      {daily && (
        <DailyChallengeCard
          formatLabel={FORMAT_LABELS[daily.format]}
          stakeCredits={daily.stakeCredits || 100}
          onPlay={playDaily}
          busy={dailyBusy}
        />
      )}

      <section aria-label="Juegos">
        <SectionTitle>Juegos</SectionTitle>
        {games.status === 'loading' && <ListSkeleton count={4} />}
        {games.status === 'error' && (
          <div>
            <p role="alert" className="mb-3 text-sm text-white/70">
              No pudimos cargar el catálogo de juegos. Mostramos los juegos conocidos.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {FALLBACK_GAMES.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </div>
        )}
        {games.status === 'ok' && (
          <div className="grid gap-3 md:grid-cols-2">
            {(games.data ?? []).map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Retos públicos">
          <SectionTitle>Retos públicos</SectionTitle>
          {challenges.status === 'loading' && <ListSkeleton count={3} />}
          {challenges.status === 'error' && (
            <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
              <p className="text-sm">{challenges.error}</p>
              <Button variant="secondary" className="mt-3" onClick={challenges.reload}>Reintentar</Button>
            </div>
          )}
          {challenges.status === 'ok' && (challenges.data?.length ?? 0) === 0 && (
            <EmptyState illustration="hands" title="No hay retos públicos ahora mismo." description="Crea un reto y comparte el enlace con tu rival." actionLabel="Crear un reto" actionHref="/retos/crear" />
          )}
          {challenges.status === 'ok' && (challenges.data?.length ?? 0) > 0 && (
            <div className="grid gap-3">
              {challenges.data!.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
            </div>
          )}
          <Link href="/retos/crear" className="mt-4 inline-block">
            <Button>Crear reto</Button>
          </Link>
        </section>
        {presence.status === 'error' && <p className="text-sm text-white/60">No pudimos cargar las personas en línea.</p>}
      </div>
    </div>
  );
}

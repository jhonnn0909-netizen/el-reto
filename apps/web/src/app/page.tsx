// Página de inicio (DESIGN.md §9): titular, manos, cómo funciona,
// retos públicos en vivo, reto del día (mejora 6) y aviso DEMO permanente.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gameApi } from '../lib/auth';
import { asList, useApiData } from '../lib/useApi';
import { getStoredUser } from '../lib/session';
import { FORMAT_LABELS } from '../lib/game';
import type { Challenge, DailyChallenge, OnlinePerson, User } from '../lib/types';
import Logo from '../components/Logo';
import { HandsRow, TrophyPhoto } from '../components/Hands';
import ChallengeCard from '../components/ChallengeCard';
import OnlinePanel from '../components/OnlinePanel';
import { DailyChallengeCard } from '../components/GameCard';
import GuestNameForm from '../components/GuestNameForm';
import EmptyState from '../components/EmptyState';
import { ListSkeleton } from '../components/Spinner';
import Toast from '../components/Toast';
import { DemoNotice } from '../components/DemoBadge';
import { Button } from '../components/ui';

export default function HomePage() {
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

  const challenges = useApiData<Challenge[]>(
    useCallback(async () => {
      const res = await gameApi.listChallenges({ limit: 3 });
      return asList(res);
    }, []),
    'home-challenges',
  );
  const presence = useApiData<OnlinePerson[]>(
    useCallback(async () => gameApi.presence(), []),
    'home-presence',
  );

  async function playDaily() {
    if (!daily) return;
    if (!getStoredUser()) {
      setShowGuest(true);
      return;
    }
    setDailyBusy(true);
    try {
      const match = await gameApi.acceptChallenge(daily.challengeId);
      router.push(`/partidas/${match.id}`);
    } catch {
      setToast('No pudimos abrir el reto del día. Inténtalo de nuevo.');
    } finally {
      setDailyBusy(false);
    }
  }

  async function afterGuest(newUser: User) {
    setUser(newUser);
    setShowGuest(false);
    await playDaily();
  }

  return (
    // Organización v7 (APROBADA): contenido centrado, máx. 1.080 px;
    // el panel en línea (200 px) va a un lado en escritorio y fijo
    // arriba en el teléfono (OnlinePanel). En el teléfono el panel va
    // primero en el DOM para quedar arriba.
    <div className="mx-auto w-full max-w-[1080px] min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_200px] min-[900px]:items-start min-[900px]:gap-7">
      <OnlinePanel
        people={Array.isArray(presence.data) ? presence.data : []}
        loading={presence.status === 'loading'}
      />
      <div className="flex min-w-0 flex-col gap-8 min-[900px]:col-start-1 min-[900px]:row-start-1">
      <Toast message={toast} kind="error" onClose={() => setToast(null)} />
      {/* Hero */}
      <section className="flex flex-col items-center gap-4 py-6 text-center">
        {/* Rayos de energía dorados detrás del logo (el logo no cambia). */}
        <div className="relative flex justify-center">
          <div aria-hidden="true" className="energy-rays animate-rays-spin pointer-events-none absolute -inset-16 opacity-50" />
          <div className="relative">
            <Logo size={96} />
          </div>
        </div>
        <h1 className="gold-text font-display text-4xl font-black leading-tight md:text-[40px]">
          Reta a quien quieras. Gana en segundos.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-white/70">
          Piedra, papel o tijera en vivo, con quien quieras, desde cualquier red. Sin instalar
          nada y sin cuenta para la primera partida.
        </p>
        <TrophyPhoto caption="El trofeo del ganador" />
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/retos/crear">
            <Button className="min-w-[160px]">Jugar ahora</Button>
          </Link>
          <Link href="/retos">
            <Button variant="secondary" className="min-w-[160px]">
              Ver retos públicos
            </Button>
          </Link>
        </div>
        <HandsRow />
      </section>

      {/* Reto del día */}
      {daily && !showGuest && (
        <DailyChallengeCard
          formatLabel={FORMAT_LABELS[daily.format]}
          stakeCredits={daily.stakeCredits || 100}
          onPlay={playDaily}
          busy={dailyBusy}
        />
      )}
      {showGuest && (
        <GuestNameForm
          title="Tu nombre para el reto del día"
          onDone={afterGuest}
        />
      )}

      {/* Cómo funciona */}
      <section aria-label="Cómo funciona">
        <h2 className="mb-3 text-center font-display text-xl font-bold">Cómo funciona</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {[
            ['1. Escribe tu nombre', 'Solo un nombre, sin correo ni contraseña.'],
            ['2. Crea o acepta un reto', 'Público para cualquiera o privado con enlace.'],
            ['3. Elige tu jugada', 'Al mismo tiempo que tu rival. Nadie copia a nadie.'],
          ].map(([title, text]) => (
            <li key={title} className="rounded-card border border-reto-gold/40 bg-reto-surface p-4">
              <h3 className="font-display font-bold">{title}</h3>
              <p className="mt-1 text-sm text-white/60">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Retos públicos en vivo */}
      <section aria-label="Retos públicos en vivo">
        <h2 className="mb-3 font-display text-xl font-bold">Retos públicos en vivo</h2>
        {challenges.status === 'loading' && <ListSkeleton count={3} />}
        {challenges.status === 'error' && (
          <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
            <p className="text-sm">{challenges.error}</p>
            <Button variant="secondary" className="mt-3" onClick={challenges.reload}>
              Reintentar
            </Button>
          </div>
        )}
        {challenges.status === 'ok' && (challenges.data?.length ?? 0) === 0 && (
          <EmptyState
            illustration="hands"
            title="No hay retos públicos ahora mismo."
            description="Sé el primero: crea un reto y comparte el enlace con tu rival."
            actionLabel="Crear un reto"
            actionHref="/retos/crear"
          />
        )}
        {challenges.status === 'ok' && (challenges.data?.length ?? 0) > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {challenges.data!.map((c) => (
              <ChallengeCard key={c.id} challenge={c} />
            ))}
          </div>
        )}
      </section>

      <DemoNotice />
      <p className="text-center text-xs text-white/50">
        {user ? `Jugando como ${user.displayName}.` : 'Entra con solo tu nombre y juega en menos de un minuto.'}{' '}
        <Link href="/ayuda" className="text-reto-gold underline underline-offset-2">
          Centro de ayuda
        </Link>
      </p>
      </div>
    </div>
  );
}

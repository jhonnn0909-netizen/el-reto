// Retos disponibles (DESIGN.md §9 + doc 04 §11.13): tarjetas con
// filtros por formato y premio, y panel lateral de personas en línea.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gameApi } from '../../lib/auth';
import { asList, useApiData } from '../../lib/useApi';
import { getStoredUser } from '../../lib/session';
import type { Challenge, OnlinePerson, User } from '../../lib/types';
import ChallengeCard from '../../components/ChallengeCard';
import OnlinePanel from '../../components/OnlinePanel';
import GuestNameForm from '../../components/GuestNameForm';
import EmptyState from '../../components/EmptyState';
import { ListSkeleton } from '../../components/Spinner';
import Toast from '../../components/Toast';
import { Button, PageHeader } from '../../components/ui';

export default function ChallengesPage() {
  const router = useRouter();
  const [formatFilter, setFormatFilter] = useState('');
  const [prizeFilter, setPrizeFilter] = useState<'ALL' | 'WITH' | 'WITHOUT'>('ALL');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [pendingChallenge, setPendingChallenge] = useState<Challenge | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const user = getStoredUser();

  const challenges = useApiData<Challenge[]>(
    useCallback(async () => {
      const res = await gameApi.listChallenges({ format: formatFilter || undefined, limit: 20 });
      return asList(res);
    }, [formatFilter]),
    `challenges-${formatFilter}`,
  );
  const presence = useApiData<OnlinePerson[]>(
    useCallback(async () => gameApi.presence(), []),
    'challenges-presence',
    20000,
  );

  // Recarga inmediata tras cada latido de presencia (OnlinePanel
  // avisa con 'elreto:presence'): el panel refleja el estado actual
  // sin esperar al siguiente ciclo de sondeo (20 s).
  useEffect(() => {
    const refresh = () => presence.reload();
    window.addEventListener('elreto:presence', refresh);
    return () => window.removeEventListener('elreto:presence', refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = (challenges.data ?? []).filter((c) => {
    if (prizeFilter === 'WITH') return c.stakeCredits > 0;
    if (prizeFilter === 'WITHOUT') return c.stakeCredits === 0;
    return true;
  });

  async function accept(challenge: Challenge) {
    if (!user) {
      setPendingChallenge(challenge);
      return;
    }
    setAcceptingId(challenge.id);
    try {
      const match = await gameApi.acceptChallenge(challenge.id);
      router.push(`/partidas/${match.id}`);
    } catch {
      setToast('Este reto ya fue aceptado por otra persona o ya no existe.');
    } finally {
      setAcceptingId(null);
    }
  }

  async function afterGuest() {
    if (!pendingChallenge) return;
    const challenge = pendingChallenge;
    setPendingChallenge(null);
    await accept(challenge);
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
        onChallenge={(p) => setToast(`Reto a ${p.username}: crea un reto y comparte el enlace.`)}
      />
      <div className="flex min-w-0 flex-col gap-6 min-[900px]:col-start-1 min-[900px]:row-start-1">
      <Toast message={toast} kind="error" onClose={() => setToast(null)} />
      <PageHeader title="Retos disponibles" subtitle="Acepta un reto y juega en segundos." />

      {pendingChallenge && (
        <GuestNameForm title="Tu nombre para aceptar el reto" onDone={afterGuest} />
      )}

      {presence.status === 'error' && user && <p className="text-sm text-white/60">No pudimos cargar las personas en línea.</p>}

      <section aria-label="Lista de retos">
          <div className="mb-3 flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm">
              Formato
              <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="rounded-lg border border-white/15 bg-reto-elevated px-2 py-2 text-sm" aria-label="Filtrar por formato">
                <option value="">Todos</option>
                <option value="BEST_OF_1">1 ronda</option>
                <option value="BEST_OF_3">Mejor de 3</option>
                <option value="BEST_OF_5">Mejor de 5</option>
                <option value="FREE">Libre</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              Premio
              <select value={prizeFilter} onChange={(e) => setPrizeFilter(e.target.value as typeof prizeFilter)} className="rounded-lg border border-white/15 bg-reto-elevated px-2 py-2 text-sm" aria-label="Filtrar por premio">
                <option value="ALL">Todos</option>
                <option value="WITH">Con premio DEMO</option>
                <option value="WITHOUT">Sin premio</option>
              </select>
            </label>
          </div>

          {challenges.status === 'loading' && <ListSkeleton count={3} />}
          {challenges.status === 'error' && (
            <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
              <p className="text-sm">{challenges.error}</p>
              {/* Sin sesión, el error es de acceso (no de red): se invita
                a entrar en vez de ofrecer un reintento que fallaría
                igual. Con sesión, el reintento sí tiene sentido. */}
              {!user && challenges.error?.startsWith('Inicia sesión') ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/login"><Button>Iniciar sesión</Button></Link>
                  <Link href="/registro"><Button variant="secondary">Crear cuenta</Button></Link>
                </div>
              ) : (
                <Button variant="secondary" className="mt-3" onClick={challenges.reload}>Reintentar</Button>
              )}
            </div>
          )}
          {challenges.status === 'ok' && visible.length === 0 && (
            <EmptyState
              illustration="hands"
              title="No hay retos públicos ahora mismo."
              description="Sé el primero: crea un reto y comparte el enlace con tu rival."
              actionLabel="Crear un reto"
              actionHref="/retos/crear"
            />
          )}
          {challenges.status === 'ok' && visible.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {visible.map((c) => (
                <ChallengeCard key={c.id} challenge={c} onAccept={accept} accepting={acceptingId === c.id} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// Invitación a un reto privado (CONTRACTS.md §9.3): el enlace lleva
// directo a la pantalla de aceptación/partida, sin pasar por el inicio.
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { gameApi } from '../../../../lib/auth';
import { apiErrorMessage, useApiData } from '../../../../lib/useApi';
import { getStoredUser } from '../../../../lib/session';
import { FORMAT_LABELS } from '../../../../lib/game';
import { formatCreditsDemo } from '../../../../lib/format';
import type { Challenge } from '../../../../lib/types';
import GuestNameForm from '../../../../components/GuestNameForm';
import Toast from '../../../../components/Toast';
import { ListSkeleton } from '../../../../components/Spinner';
import { Button, PageHeader } from '../../../../components/ui';

export default function InvitePage() {
  const params = useParams();
  const code = String(params.code ?? '');
  const router = useRouter();
  const [showGuest, setShowGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const challenge = useApiData<Challenge>(() => gameApi.getInvite(code), `invite-${code}`);

  async function accept() {
    if (!challenge.data) return;
    if (!getStoredUser()) {
      setShowGuest(true);
      return;
    }
    setBusy(true);
    try {
      const match = await gameApi.acceptChallenge(challenge.data.id);
      router.push(`/partidas/${match.id}`);
    } catch (err) {
      setToast(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (challenge.status === 'loading') return <ListSkeleton count={2} />;
  if (challenge.status === 'error' || !challenge.data) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Invitación no disponible" />
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">Este reto ya terminó o fue cancelado.</p>
          <Link href="/retos" className="mt-3 inline-block">
            <Button variant="secondary">Ver retos disponibles</Button>
          </Link>
        </div>
      </div>
    );
  }

  const c = challenge.data;
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <Toast message={toast} kind="error" onClose={() => setToast(null)} />
      <PageHeader title={`¿Aceptas el reto de ${c.creatorUsername ?? 'un jugador'}?`} subtitle={`${FORMAT_LABELS[c.format]} · Reto privado`} />
      {c.stakeCredits > 0 && (
        <p className="text-sm">
          Premio: <span className="font-mono font-semibold text-reto-demo">{formatCreditsDemo(c.stakeCredits)}</span>
        </p>
      )}
      {showGuest ? (
        <GuestNameForm title="Tu nombre para jugar este reto" onDone={() => { setShowGuest(false); void accept(); }} />
      ) : (
        <Button className="w-full" onClick={accept} disabled={busy}>
          {busy ? 'Aceptando…' : 'Aceptar reto'}
        </Button>
      )}
      <p className="text-center text-sm text-white/60">
        Solo necesitas un nombre para jugar. Sin cuenta, sin instalar nada.
      </p>
    </div>
  );
}

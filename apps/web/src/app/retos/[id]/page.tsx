// Detalle de un reto: aceptar (con nombre de invitado si hace falta),
// cancelar si eres el creador y ver la partida en curso (mejora 5).
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { gameApi } from '../../../lib/auth';
import { apiErrorMessage, useApiData } from '../../../lib/useApi';
import { getStoredUser } from '../../../lib/session';
import { FORMAT_LABELS } from '../../../lib/game';
import { formatCreditsDemo, timeAgo } from '../../../lib/format';
import type { Challenge } from '../../../lib/types';
import GuestNameForm from '../../../components/GuestNameForm';
import Modal from '../../../components/Modal';
import Toast from '../../../components/Toast';
import { ListSkeleton } from '../../../components/Spinner';
import { Avatar, Button, PageHeader } from '../../../components/ui';
import { DemoBadge } from '../../../components/DemoBadge';
import ShareButtons from '../../../components/ShareButtons';

export default function ChallengeDetailPage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const router = useRouter();
  const [showGuest, setShowGuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const challenge = useApiData<Challenge>(() => gameApi.getChallenge(id), `challenge-${id}`);
  const user = getStoredUser();
  const isCreator = Boolean(user && challenge.data && challenge.data.creatorId === user.id);

  async function accept() {
    if (!getStoredUser()) {
      setShowGuest(true);
      return;
    }
    setBusy(true);
    try {
      const match = await gameApi.acceptChallenge(id);
      router.push(`/partidas/${match.id}`);
    } catch (err) {
      setToast(apiErrorMessage(err));
      setToastKind('error');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setConfirmCancel(false);
    try {
      await gameApi.cancelChallenge(id);
      router.push('/retos');
    } catch {
      setToast('No pudimos cancelar el reto. Inténtalo de nuevo.');
      setToastKind('error');
    }
  }

  if (challenge.status === 'loading') return <ListSkeleton count={2} />;
  if (challenge.status === 'error' || !challenge.data) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Reto no disponible" />
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          {/* Se muestra el error real, no un texto fijo: un fallo
            transitorio de red o de sesión no es «el reto ya terminó». */}
          <p className="text-sm">{challenge.error ?? 'Este reto ya terminó o fue cancelado.'}</p>
          <Link href="/retos" className="mt-3 inline-block">
            <Button variant="secondary">Ver retos disponibles</Button>
          </Link>
        </div>
      </div>
    );
  }

  const c = challenge.data;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteUrl = c.inviteCode ? `${origin}/retos/invitar/${c.inviteCode}` : `${origin}/retos/${c.id}`;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <Toast message={toast} kind={toastKind} onClose={() => setToast(null)} />
      <PageHeader title={`Reto de ${c.creatorUsername ?? 'un jugador'}`} subtitle={`${FORMAT_LABELS[c.format]} · ${c.visibility === 'PUBLIC' ? 'Público' : 'Privado'} · ${timeAgo(c.createdAt)}`} />
      <div className="flex items-center gap-3 rounded-card border border-reto-gold/40 bg-reto-surface p-4">
        <Avatar name={c.creatorUsername ?? 'Jugador'} size={48} />
        <div>
          <p className="font-display font-bold">{c.creatorUsername ?? 'Jugador'}</p>
          <p className="text-sm text-white/60">Creador del reto</p>
        </div>
      </div>
      {c.stakeCredits > 0 && (
        <p className="flex items-center gap-2 text-sm">
          Premio: <span className="font-mono font-semibold text-reto-demo">{formatCreditsDemo(c.stakeCredits)}</span>
          <DemoBadge />
        </p>
      )}
      <p className="text-sm text-white/70">
        Estado: <strong className="text-reto-cream">{c.status === 'OPEN' ? 'Abierto, esperando rival' : c.status}</strong>
      </p>

      {showGuest ? (
        <GuestNameForm title="Tu nombre para aceptar el reto" onDone={() => { setShowGuest(false); void accept(); }} />
      ) : c.status === 'OPEN' && !isCreator ? (
        <Button className="w-full" onClick={accept} disabled={busy}>
          {busy ? 'Aceptando…' : 'Aceptar reto'}
        </Button>
      ) : null}

      {isCreator && c.status === 'OPEN' && (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-center text-sm font-semibold text-reto-gold">Esperando rival…</p>
          <ShareButtons url={inviteUrl} text={`¿Aceptas mi reto en El Reto? ${FORMAT_LABELS[c.format]}.`} label="Compartir enlace de invitación" />
          <Button variant="secondary" onClick={() => setConfirmCancel(true)}>Cancelar reto</Button>
        </div>
      )}

      {c.status === 'ACCEPTED' && (
        <div className="flex flex-col gap-3 rounded-card border border-reto-gold/40 bg-reto-surface p-4">
          <p className="text-sm font-semibold">Este reto ya fue aceptado. La partida está en curso o terminó.</p>
          {c.matchId ? (
            <Link href={`/partidas/${c.matchId}`}>
              <Button className="w-full">Ir a la partida</Button>
            </Link>
          ) : (
            <Link href="/retos">
              <Button variant="secondary" className="w-full">Ver otros retos</Button>
            </Link>
          )}
        </div>
      )}

      {confirmCancel && (
        <Modal title="¿Cancelar este reto?" confirmLabel="Sí, cancelar reto" onConfirm={cancel} onCancel={() => setConfirmCancel(false)} danger>
          <p>El reto desaparecerá de la lista y nadie podrá aceptarlo.</p>
        </Modal>
      )}
    </div>
  );
}

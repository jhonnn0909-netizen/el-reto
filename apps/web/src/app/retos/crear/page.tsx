// Crear reto (DESIGN.md §9 + mejora 8): nombre si no hay sesión,
// formato en 4 tarjetas, visibilidad, premio DEMO opcional (máx. 1.000,
// mín. 10 si hay premio; CONTRACTS.md §9.3), resumen y pantalla de
// espera con enlace para compartir (WhatsApp, Facebook, copiar).
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gameApi } from '../../../lib/auth';
import { apiErrorMessage } from '../../../lib/useApi';
import { getStoredUser, isGuestUser } from '../../../lib/session';
import { FORMAT_DESCRIPTIONS, FORMAT_LABELS } from '../../../lib/game';
import { formatCreditsDemo } from '../../../lib/format';
import type { Challenge, ChallengeFormat, User } from '../../../lib/types';
import GuestNameForm from '../../../components/GuestNameForm';
import Modal from '../../../components/Modal';
import Toast from '../../../components/Toast';
import ShareButtons from '../../../components/ShareButtons';
import { Button, Field, PageHeader, TextInput } from '../../../components/ui';

const FORMATS: ChallengeFormat[] = ['BEST_OF_1', 'BEST_OF_3', 'BEST_OF_5', 'FREE'];

export default function CreateChallengePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [format, setFormat] = useState<ChallengeFormat>('BEST_OF_3');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [stake, setStake] = useState(0);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [created, setCreated] = useState<Challenge | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const guest = isGuestUser(user);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stake > 0 && stake < 10) {
      setStakeError('El premio mínimo es de 10 créditos DEMO. Pon 0 para un reto sin premio.');
      return;
    }
    if (stake > 1000) {
      setStakeError('El premio máximo es de 1.000 créditos DEMO.');
      return;
    }
    if (guest && stake > 0) {
      setStakeError('Los invitados solo pueden crear retos sin premio. Crea una cuenta para jugar con premio.');
      return;
    }
    setStakeError(null);
    setBusy(true);
    setFormError(null);
    try {
      const challenge = await gameApi.createChallenge({
        visibility,
        format,
        stakeCredits: stake,
      });
      setCreated(challenge);
      setToast('Reto creado. Comparte el enlace con tu rival.');
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!created) return;
    setConfirmCancel(false);
    try {
      await gameApi.cancelChallenge(created.id);
      router.push('/retos');
    } catch {
      setToast('No pudimos cancelar el reto. Inténtalo de nuevo.');
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Crear un reto" subtitle="Primero, tu nombre. Solo eso para jugar." />
        <GuestNameForm onDone={(u) => setUser(u)} />
      </div>
    );
  }

  if (created) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteUrl = created.inviteCode
      ? `${origin}/retos/invitar/${created.inviteCode}`
      : `${origin}/retos/${created.id}`;
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Toast message={toast} onClose={() => setToast(null)} />
        <PageHeader title="Reto creado" subtitle="Comparte el enlace con tu rival." />
        <div role="status" className="rounded-card border border-reto-gold/40 bg-reto-gold/10 p-5 text-center">
          <p className="font-display text-lg font-bold">Esperando rival…</p>
          <p className="mt-1 text-sm text-white/70">
            {FORMAT_LABELS[created.format]} · {created.visibility === 'PUBLIC' ? 'Público' : 'Privado'}
            {created.stakeCredits > 0 ? ` · Premio ${formatCreditsDemo(created.stakeCredits)}` : ''}
          </p>
          <p className="mt-3 break-all rounded-lg bg-reto-elevated px-3 py-2 font-mono text-sm">{inviteUrl}</p>
          <div className="mt-4 flex justify-center">
            <ShareButtons url={inviteUrl} text={`¿Aceptas mi reto en El Reto? ${FORMAT_LABELS[created.format]}.`} label="Compartir enlace de invitación" />
          </div>
        </div>
        <Link href={`/retos/${created.id}`}>
          <Button className="w-full">Ver mi reto</Button>
        </Link>
        <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
          Cancelar reto
        </Button>
        {guest && (
          <div className="rounded-card border border-reto-gold/40 bg-reto-gold/10 p-4">
            <p className="text-sm font-semibold">Guarda tu nombre y tu ranking creando una cuenta.</p>
            <div className="mt-3 flex gap-2">
              <Link href="/registro"><Button>Crear cuenta</Button></Link>
              <Button variant="secondary" onClick={() => setToast('Seguimos jugando como invitado.')}>Ahora no</Button>
            </div>
          </div>
        )}
        {confirmCancel && (
          <Modal
            title="¿Cancelar este reto?"
            confirmLabel="Sí, cancelar reto"
            onConfirm={cancel}
            onCancel={() => setConfirmCancel(false)}
            danger
          >
            <p>El reto desaparecerá de la lista y nadie podrá aceptarlo.</p>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Toast message={toast} onClose={() => setToast(null)} />
      <PageHeader title="Crear un reto" subtitle={`Jugando como ${user.displayName}.`} />
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Formato</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Formato del reto">
            {FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={format === f}
                onClick={() => setFormat(f)}
                className={`rounded-card border p-3 text-left ${
                  format === f ? 'border-reto-gold bg-reto-gold/10' : 'border-white/15 bg-reto-surface'
                }`}
              >
                <span className="block font-display font-bold">{FORMAT_LABELS[f]}</span>
                <span className="mt-0.5 block text-xs text-white/60">{FORMAT_DESCRIPTIONS[f]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Visibilidad</legend>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Visibilidad del reto">
            <button type="button" role="radio" aria-checked={visibility === 'PUBLIC'} onClick={() => setVisibility('PUBLIC')} className={`rounded-card border p-3 text-left ${visibility === 'PUBLIC' ? 'border-reto-gold bg-reto-gold/10' : 'border-white/15 bg-reto-surface'}`}>
              <span className="block font-semibold">Público</span>
              <span className="text-xs text-white/60">Cualquiera puede aceptarlo.</span>
            </button>
            <button type="button" role="radio" aria-checked={visibility === 'PRIVATE'} onClick={() => setVisibility('PRIVATE')} className={`rounded-card border p-3 text-left ${visibility === 'PRIVATE' ? 'border-reto-gold bg-reto-gold/10' : 'border-white/15 bg-reto-surface'}`}>
              <span className="block font-semibold">Privado</span>
              <span className="text-xs text-white/60">Solo con el enlace de invitación.</span>
            </button>
          </div>
        </fieldset>

        <Field
          label="Premio para el ganador (créditos DEMO, opcional)"
          id="stake"
          error={stakeError}
          hint="El premio sale de tu saldo DEMO. Pon 0 para un reto sin premio."
        >
          <TextInput
            id="stake"
            type="number"
            min={0}
            max={1000}
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            error={stakeError}
          />
        </Field>

        <div className="rounded-card border border-reto-gold/40 bg-reto-surface p-4 text-sm">
          <h2 className="font-display font-bold">Resumen del reto</h2>
          <p className="mt-1 text-white/70">
            {FORMAT_LABELS[format]} · {visibility === 'PUBLIC' ? 'Público' : 'Privado'} · Premio:{' '}
            <span className="font-mono text-reto-demo">{formatCreditsDemo(stake)}</span>
          </p>
        </div>

        {formError && <p role="alert" className="text-sm text-reto-error">{formError}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creando reto…' : 'Crear reto y compartir'}
        </Button>
      </form>
    </div>
  );
}

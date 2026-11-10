// Perfil (DESIGN.md §9): avatar, estadísticas con rachas y nivel
// (mejoras 1 y 9), datos editables con confirmación y eliminar cuenta.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { gameApi, usersApi } from '../../lib/auth';
import { useApiData } from '../../lib/useApi';
import { getStoredUser } from '../../lib/session';
import type { RankingEntry, User } from '../../lib/types';
import { Avatar, Button, Field, PageHeader, SectionTitle, TextInput } from '../../components/ui';
import { LevelBadge } from '../../components/RankingTable';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import Toast from '../../components/Toast';
import { ListSkeleton } from '../../components/Spinner';

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [confirmName, setConfirmName] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const [busy, setBusy] = useState(false);

  const profile = useApiData<User>(() => usersApi.me(), 'profile-me');
  const ranking = useApiData<RankingEntry | null>(
    () => {
      const u = getStoredUser();
      return u ? gameApi.rankingOf(u.username).catch(() => null) : Promise.resolve(null);
    },
    'profile-ranking',
  );

  useEffect(() => {
    if (profile.status === 'ok' && profile.data) {
      setUser(profile.data);
      setDisplayName(profile.data.displayName);
      setSavedName(profile.data.displayName);
    }
  }, [profile.status, profile.data]);

  const changed = displayName.trim() !== savedName && displayName.trim().length > 0;

  async function save() {
    setBusy(true);
    try {
      const updated = await usersApi.updateMe({ displayName: displayName.trim() });
      setSavedName(updated.displayName);
      setConfirmName(false);
      setToast('Nombre actualizado.');
      setToastKind('success');
    } catch {
      setToast('No pudimos guardar los cambios. Inténtalo de nuevo.');
      setToastKind('error');
    } finally {
      setBusy(false);
    }
  }

  if (profile.status === 'loading') return <ListSkeleton count={3} />;
  if (profile.status === 'error') {
    return (
      <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
        <PageHeader title="Tu perfil" />
        <p className="text-sm">{profile.error}</p>
        <Button variant="secondary" className="mt-3" onClick={profile.reload}>Reintentar</Button>
      </div>
    );
  }
  if (!user) return <EmptyState title="Inicia sesión para ver tu perfil" description="Tu perfil guarda tu nombre, tus estadísticas y tu ranking." actionLabel="Entrar" actionHref="/login" />;

  const since = new Date(user.createdAt);
  const sinceLabel = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(since);
  const stats = ranking.data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Toast message={toast} kind={toastKind} onClose={() => setToast(null)} />
      <PageHeader title="Tu perfil" />
      <section className="flex items-center gap-4 rounded-card border border-reto-gold/40 bg-reto-surface p-5">
        <Avatar name={user.displayName} size={64} />
        <div>
          <h2 className="font-display text-xl font-bold">{user.displayName}</h2>
          <p className="text-sm text-white/60">@{user.username}</p>
          <p className="text-sm text-white/60">Jugando desde {sinceLabel}</p>
          <div className="mt-1">
            <LevelBadge level={stats?.level} levelTitle={stats?.levelTitle} />
          </div>
        </div>
      </section>

      <section aria-label="Estadísticas">
        <SectionTitle>Estadísticas</SectionTitle>
        {ranking.status === 'loading' && <ListSkeleton count={1} />}
        {ranking.status === 'error' && <p className="text-sm text-white/60">No pudimos cargar tus estadísticas ahora mismo.</p>}
        {ranking.status === 'ok' && (
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              ['Partidas', stats?.matchesPlayed ?? 0],
              ['Victorias', stats?.wins ?? 0],
              ['Derrotas', stats?.losses ?? 0],
              ['Empates', stats?.ties ?? 0],
              ['Racha actual', stats?.currentStreak ?? 0],
              ['Mejor racha', stats?.bestStreak ?? 0],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-card border border-reto-gold/40 bg-reto-surface p-4 text-center">
                <dt className="text-xs text-white/60">{label}</dt>
                <dd className="font-mono text-2xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section aria-label="Datos editables">
        <SectionTitle>Tus datos</SectionTitle>
        <div className="flex flex-col gap-4 rounded-card border border-reto-gold/40 bg-reto-surface p-5">
          <Field label="Nombre visible" id="display-name" hint="Cambiar el nombre pide confirmación.">
            <TextInput id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <p className="text-sm text-white/60">
            Correo: <span className="text-reto-cream">{user.username}@ —</span> tu correo no se muestra a otros jugadores.
          </p>
          <Button className="self-start" disabled={!changed || busy} onClick={() => setConfirmName(true)}>
            Guardar cambios
          </Button>
        </div>
      </section>

      <section aria-label="Enlaces de cuenta" className="flex flex-wrap gap-4 text-sm">
        <Link href="/configuracion/seguridad" className="text-reto-gold underline underline-offset-2">Configuración de seguridad</Link>
        <button type="button" className="text-reto-error underline underline-offset-2" onClick={() => setConfirmDelete(true)}>
          Eliminar cuenta
        </button>
      </section>

      {confirmName && (
        <Modal
          title={`¿Cambiar tu nombre a «${displayName.trim()}»?`}
          confirmLabel="Sí, cambiar nombre"
          onConfirm={save}
          onCancel={() => setConfirmName(false)}
          busy={busy}
        >
          <p>Tu nombre visible cambiará en los retos y en el ranking. Podrás volver a cambiarlo después.</p>
        </Modal>
      )}
      {confirmDelete && (
        <Modal
          title="¿Eliminar tu cuenta?"
          confirmLabel="Eliminar mi cuenta"
          onConfirm={() => {
            setConfirmDelete(false);
            setToast('Para eliminar tu cuenta, escribe a soporte desde el centro de ayuda. Esta acción es irreversible.');
            setToastKind('error');
          }}
          onCancel={() => setConfirmDelete(false)}
          danger
        >
          <p>
            Se borrarán tu cuenta, tu historial y tu saldo DEMO. Esta acción no se puede deshacer.
            Escribe tu nombre de usuario para confirmar:
          </p>
          <div className="mt-3">
            <TextInput
              id="delete-confirm"
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              placeholder={user.username}
              aria-label="Escribe tu nombre de usuario para confirmar"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

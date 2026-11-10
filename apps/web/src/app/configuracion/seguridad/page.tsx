// Configuración de seguridad (DESIGN.md §9 + mejora 4): cambiar
// contraseña, sesiones activas, avisos de inicio de sesión, interruptores
// de sonidos y vibración (DESACTIVADOS por defecto, doc 04 D12),
// reducir animaciones, desactivar confeti, privacidad y zona de peligro.
'use client';

import { useEffect, useState } from 'react';
import { authApi } from '../../../lib/auth';
import { apiErrorMessage, useApiData } from '../../../lib/useApi';
import { getPrefs, setPrefs, type Prefs } from '../../../lib/session';
import type { SessionInfo } from '../../../lib/types';
import { setSoundsEnabled, setVibrationEnabled, soundsEnabled, vibrationEnabled } from '../../../lib/sounds';
import Modal from '../../../components/Modal';
import Toast from '../../../components/Toast';
import { ListSkeleton } from '../../../components/Spinner';
import { Button, Field, PageHeader, SectionTitle, TextInput } from '../../../components/ui';

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-card border border-reto-gold/40 bg-reto-surface p-4">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-white/60">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-9 shrink-0 accent-reto-gold"
      />
    </label>
  );
}

export default function SecurityPage() {
  const [prefs, setPrefsState] = useState<Prefs>(() => getPrefs());
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const sessions = useApiData<SessionInfo[]>(() => authApi.sessions(), 'security-sessions');

  useEffect(() => {
    setPrefsState((p) => ({ ...p, sounds: soundsEnabled(), vibration: vibrationEnabled() }));
  }, []);

  function updatePrefs(patch: Partial<Prefs>) {
    setPrefsState(setPrefs(patch));
  }

  function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (currentPw.length === 0) {
      setPwError('Escribe tu contraseña actual.');
      return;
    }
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      setPwError('La contraseña nueva necesita al menos 8 caracteres, con una letra y un número.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Las contraseñas nuevas no coinciden. Escríbelas igual en los dos campos.');
      return;
    }
    setPwError(null);
    setBusy(true);
    // La API del MVP no expone cambio de contraseña con la actual:
    // se usa el flujo de recuperación. Se informa sin inventar un endpoint.
    setTimeout(() => {
      setBusy(false);
      setToast('Para cambiar tu contraseña, usa «Recuperar contraseña» desde el inicio de sesión. Al cambiarla se cierran las demás sesiones.');
      setToastKind('error');
    }, 300);
  }

  async function revokeSession(id: string) {
    try {
      await authApi.revokeSession(id);
      setToast('Sesión cerrada.');
      setToastKind('success');
      sessions.reload();
    } catch (err) {
      setToast(apiErrorMessage(err));
      setToastKind('error');
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Toast message={toast} kind={toastKind} onClose={() => setToast(null)} />
      <PageHeader title="Configuración de seguridad" subtitle="Contraseña, sesiones, avisos y efectos." />

      <section aria-label="Cambiar contraseña">
        <SectionTitle>Cambiar contraseña</SectionTitle>
        <form onSubmit={changePassword} className="flex flex-col gap-3 rounded-card border border-reto-gold/40 bg-reto-surface p-5">
          <Field label="Contraseña actual" id="current-password" error={pwError}>
            <TextInput id="current-password" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" error={pwError} />
          </Field>
          <Field label="Contraseña nueva" id="new-password">
            <TextInput id="new-password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Repetir contraseña nueva" id="confirm-password">
            <TextInput id="confirm-password" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Button type="submit" className="self-start" disabled={busy}>
            {busy ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </form>
      </section>

      <section aria-label="Sesiones activas">
        <SectionTitle>Sesiones activas</SectionTitle>
        {sessions.status === 'loading' && <ListSkeleton count={2} />}
        {sessions.status === 'error' && <p className="text-sm text-white/60">No pudimos cargar tus sesiones ahora mismo.</p>}
        {sessions.status === 'ok' && (sessions.data?.length ?? 0) === 0 && (
          <p className="rounded-card border border-reto-gold/40 bg-reto-surface p-4 text-sm text-white/70">No hay otras sesiones activas.</p>
        )}
        {sessions.status === 'ok' && (sessions.data?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-2">
            {sessions.data!.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-card border border-reto-gold/40 bg-reto-surface p-4 text-sm">
                <div>
                  <p className="font-semibold">{s.userAgent ?? 'Dispositivo desconocido'}</p>
                  <p className="text-xs text-white/50">{new Date(s.createdAt).toLocaleDateString('es-ES')}{s.current ? ' · Sesión actual' : ''}</p>
                </div>
                {!s.current && (
                  <Button variant="secondary" className="min-h-[36px] px-3 py-1 text-xs" onClick={() => void revokeSession(s.id)}>
                    Cerrar sesión
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Avisos y efectos" className="flex flex-col gap-3">
        <SectionTitle>Avisos y efectos</SectionTitle>
        <Toggle
          label="Avísame cuando se inicie sesión desde un dispositivo nuevo"
          checked={prefs.notifyNewDevice}
          onChange={(v) => updatePrefs({ notifyNewDevice: v })}
        />
        <Toggle
          label="Sonidos"
          description="Pitidos de cuenta atrás, jugada, victoria y derrota. Desactivados por defecto."
          checked={prefs.sounds}
          onChange={(v) => {
            setSoundsEnabled(v);
            setPrefsState((p) => ({ ...p, sounds: v }));
          }}
        />
        <Toggle
          label="Vibración"
          description="Vibra al ganar o perder una partida. Desactivada por defecto."
          checked={prefs.vibration}
          onChange={(v) => {
            setVibrationEnabled(v);
            setPrefsState((p) => ({ ...p, vibration: v }));
          }}
        />
        <Toggle
          label="Reducir animaciones"
          description="Desactiva el pulso del logo, el confeti y el movimiento de las manos."
          checked={prefs.reduceMotion}
          onChange={(v) => updatePrefs({ reduceMotion: v })}
        />
        <Toggle
          label="Desactivar confeti"
          description="Sin confeti al ganar rondas ni partidas."
          checked={prefs.disableConfetti}
          onChange={(v) => updatePrefs({ disableConfetti: v })}
        />
      </section>

      <section aria-label="Privacidad">
        <SectionTitle>Privacidad</SectionTitle>
        <div className="flex flex-col gap-3 rounded-card border border-reto-gold/40 bg-reto-surface p-5 text-sm">
          <label className="flex items-center justify-between gap-3">
            Quién puede retarte
            <select className="rounded-lg border border-white/15 bg-reto-elevated px-2 py-2" aria-label="Quién puede retarte">
              <option value="ALL">Todos</option>
              <option value="LINK">Solo con enlace</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            Perfil visible en el ranking
            <input type="checkbox" defaultChecked className="h-5 w-5 accent-reto-gold" aria-label="Perfil visible en el ranking" />
          </label>
        </div>
      </section>

      <section aria-label="Zona de peligro" className="rounded-card border border-reto-error/50 bg-reto-error/5 p-5">
        <h2 className="font-display text-lg font-bold text-reto-error">Zona de peligro</h2>
        <p className="mt-1 text-sm text-white/70">
          Eliminar tu cuenta borra tu cuenta, tu historial y tu saldo DEMO. Esta acción es irreversible.
        </p>
        <Button variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)}>
          Eliminar cuenta
        </Button>
      </section>

      {confirmDelete && (
        <Modal
          title="¿Eliminar tu cuenta para siempre?"
          confirmLabel="Eliminar mi cuenta"
          onConfirm={() => {
            setConfirmDelete(false);
            setToast('Para eliminar tu cuenta, escribe a soporte desde el centro de ayuda. Esta acción es irreversible.');
            setToastKind('error');
          }}
          onCancel={() => setConfirmDelete(false)}
          danger
        >
          <p>Se borrarán tu cuenta, tu historial y tu saldo DEMO. Escribe tu nombre de usuario para confirmar:</p>
          <div className="mt-3">
            <TextInput id="delete-username" value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder="Tu nombre de usuario" aria-label="Escribe tu nombre de usuario para confirmar" />
          </div>
        </Modal>
      )}
    </div>
  );
}

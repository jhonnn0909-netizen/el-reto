// Recuperación de contraseña (DESIGN.md §9): 3 pasos — solicitar,
// enlace con caducidad visible, nueva contraseña. Mensaje neutro que
// nunca confirma si un correo existe.
'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authApi } from '../../lib/auth';
import { apiErrorMessage } from '../../lib/useApi';
import { Button, Field, PageHeader, TextInput } from '../../components/ui';
import { Spinner } from '../../components/Spinner';

function RecoverForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Escribe un correo válido, por ejemplo, nombre@correo.com.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.forgotPassword(email);
      setEmailSent(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Usa al menos 8 caracteres, con una letra y un número.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Las contraseñas no coinciden. Escríbelas igual en los dos campos.');
      return;
    }
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Paso 3: nueva contraseña (llegada por el enlace del correo).
  if (token) {
    if (done) {
      return (
        <div className="mx-auto max-w-lg text-center">
          <PageHeader title="Contraseña actualizada" subtitle="Inicia sesión con tu contraseña nueva." />
          <Link href="/login">
            <Button>Ir a iniciar sesión</Button>
          </Link>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Crea una contraseña nueva" subtitle="Este enlace caduca en 1 hora y es de un solo uso." />
        <form onSubmit={savePassword} className="flex flex-col gap-4" noValidate>
          <Field label="Contraseña nueva" id="new-password" error={error}>
            <TextInput id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres, con una letra y un número" autoComplete="new-password" error={error} />
          </Field>
          <Field label="Repetir contraseña" id="confirm-password">
            <TextInput id="confirm-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repite la contraseña nueva" autoComplete="new-password" />
          </Field>
          {error && <p role="alert" className="text-sm text-reto-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
      </div>
    );
  }

  // Paso 1: solicitar el enlace.
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Recuperar contraseña" subtitle="Te enviamos un enlace para crear una contraseña nueva." />
      {emailSent ? (
        <div role="status" className="rounded-card border border-reto-success/50 bg-reto-success/10 p-5 text-center">
          <p className="font-semibold">Si ese correo está registrado, te enviamos un enlace para crear una contraseña nueva.</p>
          <p className="mt-2 text-sm text-white/70">Revisa tu bandeja de entrada y también el correo no deseado.</p>
          <Button variant="secondary" className="mt-4" onClick={() => setEmailSent(false)}>
            Pedir un enlace nuevo
          </Button>
        </div>
      ) : (
        <form onSubmit={requestLink} className="flex flex-col gap-4" noValidate>
          <Field label="Correo electrónico" id="email" error={error}>
            <TextInput id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" autoComplete="email" error={error} />
          </Field>
          {error && <p role="alert" className="text-sm text-reto-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar enlace'}
          </Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-white/60">
        <Link href="/login" className="text-reto-gold underline underline-offset-2">Volver a iniciar sesión</Link>
      </p>
    </div>
  );
}

export default function RecoverPage() {
  return (
    <Suspense fallback={<Spinner label="Cargando…" />}>
      <RecoverForm />
    </Suspense>
  );
}

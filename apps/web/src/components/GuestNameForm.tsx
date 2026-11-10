// Flujo de invitado (CONTRACTS.md §9.2): si no hay sesión, crear o
// aceptar un reto pide primero solo el nombre y llama a POST /auth/guest.
'use client';

import { useState } from 'react';
import { authApi } from '../lib/auth';
import { apiErrorMessage } from '../lib/useApi';
import type { User } from '../lib/types';
import { Button, Field, TextInput } from './ui';

export function validateGuestName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 3) return 'Escribe un nombre de 3 a 30 caracteres.';
  if (trimmed.length > 30) return 'El nombre no puede tener más de 30 caracteres.';
  return null;
}

export default function GuestNameForm({
  title = 'Juega sin cuenta',
  onDone,
}: {
  title?: string;
  onDone: (user: User) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateGuestName(name);
    setError(validation);
    if (validation) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await authApi.guest(name.trim());
      onDone(res.user);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-card border border-reto-gold/40 bg-reto-surface p-5" noValidate>
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-white/60">
        Solo necesitas un nombre para jugar. Sin correo ni contraseña.
      </p>
      <div className="mt-4">
        <Field label="Tu nombre" id="guest-name" error={error} hint="De 3 a 30 caracteres. Será tu nombre en la partida.">
          <TextInput
            id="guest-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Escribe tu nombre"
            autoComplete="nickname"
            error={error}
          />
        </Field>
      </div>
      {formError && (
        <p role="alert" className="mt-3 text-sm text-reto-error">
          {formError}
        </p>
      )}
      <Button type="submit" className="mt-4 w-full" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar a jugar'}
      </Button>
    </form>
  );
}

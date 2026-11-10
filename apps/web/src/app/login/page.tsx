// Inicio de sesión (DESIGN.md §9): error genérico sin decir qué falla.
// Con un enlace de reto pendiente, vuelve a ese reto, no al inicio.
'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '../../lib/auth';
import { validateLogin } from '../../lib/validation';
import { Button, Field, PageHeader, TextInput } from '../../components/ui';
import { Spinner } from '../../components/Spinner';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/panel';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateLogin(identifier, password);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      await authApi.login({ email: identifier.trim(), password });
      router.push(next.startsWith('/') ? next : '/panel');
    } catch {
      // Mensaje genérico por seguridad: sin decir qué falla.
      setFormError('El correo o la contraseña no coinciden. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Inicia sesión" subtitle="Vuelve a tus retos, tu ranking y tus créditos DEMO." />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Correo electrónico o nombre de usuario" id="identifier" error={errors.identifier}>
          <TextInput
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="nombre@correo.com o tu_nombre"
            autoComplete="username"
            error={errors.identifier}
          />
        </Field>
        <Field label="Contraseña" id="password" error={errors.password}>
          <div className="flex gap-2">
            <TextInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              autoComplete="current-password"
              error={errors.password}
            />
            <Button type="button" variant="secondary" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </Button>
          </div>
        </Field>
        <Link href="/recuperar" className="self-start text-sm text-reto-gold underline underline-offset-2">
          ¿Olvidaste tu contraseña?
        </Link>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-reto-gold" />
          Mantener la sesión iniciada en este dispositivo
        </label>
        {formError && (
          <p role="alert" className="text-sm text-reto-error">
            {formError}{' '}
            <Link href="/recuperar" className="underline underline-offset-2">Recuperar contraseña</Link>
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-white/60">
        ¿No tienes cuenta?{' '}
        <Link href="/registro" className="text-reto-gold underline underline-offset-2">Regístrate</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner label="Cargando…" />}>
      <LoginForm />
    </Suspense>
  );
}

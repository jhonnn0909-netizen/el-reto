// Registro (DESIGN.md §9): nombre de usuario con comprobación en vivo,
// correo, contraseña con fortaleza, repetir contraseña y condiciones.
// Si hay sesión de invitado, convierte la cuenta (CONTRACTS.md §9.2).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '../../lib/auth';
import { passwordStrength, validateRegister } from '../../lib/validation';
import { apiErrorMessage } from '../../lib/useApi';
import { getStoredUser, isGuestUser } from '../../lib/session';
import { Button, Field, PageHeader, TextInput } from '../../components/ui';
import Toast from '../../components/Toast';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    setIsGuest(isGuestUser(u));
    if (u?.role === 'GUEST') setUsername(u.displayName.replace(/\s+/g, '_').slice(0, 30));
  }, []);

  // Comprobación en vivo de disponibilidad del nombre.
  useEffect(() => {
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
      setUsernameAvailable(null);
      return;
    }
    const t = setTimeout(() => {
      authApi
        .checkUsername(username)
        .then((r) => setUsernameAvailable(r.available))
        .catch(() => setUsernameAvailable(null));
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateRegister({ username, email, password, confirm, terms });
    if (usernameAvailable === false) {
      errs.username = 'Ese nombre ya está registrado. Prueba con otro.';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      document.getElementById('username')?.focus();
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      if (isGuest) {
        await authApi.convertGuest({ username, email, password });
        setToast('Tu cuenta de invitado ahora es una cuenta guardada. ¡Hola!');
      } else {
        await authApi.register({ username, email, password, displayName: username });
        setToast(`Cuenta creada. ¡Hola, ${username}!`);
      }
      router.push('/panel');
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const strength = passwordStrength(password);

  return (
    <div className="mx-auto max-w-lg">
      <Toast message={toast} onClose={() => setToast(null)} />
      <PageHeader
        title={isGuest ? 'Guarda tu nombre y tu ranking' : 'Crea tu cuenta'}
        subtitle={
          isGuest
            ? 'Convierte tu sesión de invitado en una cuenta para guardar tu nombre, tu ranking y tu historial.'
            : 'Guarda tu nombre, tu ranking y tu historial. Jugar no exige cuenta: esto es solo una mejora.'
        }
      />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Nombre de usuario"
          id="username"
          error={errors.username}
          hint="Será tu nombre en los retos y en el ranking. No lo podrás cambiar sin confirmación."
        >
          <TextInput
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="tu_nombre"
            autoComplete="username"
            error={errors.username}
          />
        </Field>
        {usernameAvailable === true && !errors.username && (
          <p role="status" className="text-sm text-reto-success">✓ Ese nombre está disponible.</p>
        )}
        {usernameAvailable === false && !errors.username && (
          <p role="alert" className="text-sm text-reto-error">Ese nombre ya está registrado. Prueba con otro.</p>
        )}
        <Field label="Correo electrónico" id="email" error={errors.email}>
          <TextInput
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@correo.com"
            autoComplete="email"
            error={errors.email}
          />
        </Field>
        <Field label="Contraseña" id="password" error={errors.password} hint="Mínimo 8 caracteres, con una letra y un número.">
          <div className="flex gap-2">
            <TextInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              autoComplete="new-password"
              error={errors.password}
            />
            <Button type="button" variant="secondary" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </Button>
          </div>
        </Field>
        {password.length > 0 && (
          <p role="status" className="text-sm text-white/70">
            Fortaleza de la contraseña: <strong className={strength === 'fuerte' ? 'text-reto-success' : strength === 'media' ? 'text-reto-warning' : 'text-reto-error'}>{strength}</strong>
          </p>
        )}
        <Field label="Repetir contraseña" id="confirm" error={errors.confirm}>
          <TextInput
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repite tu contraseña"
            autoComplete="new-password"
            error={errors.confirm}
          />
        </Field>
        <div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 h-4 w-4 accent-reto-gold" />
            <span>
              Acepto las <Link href="/ayuda" className="text-reto-gold underline underline-offset-2">condiciones de uso</Link> y la{' '}
              <Link href="/ayuda" className="text-reto-gold underline underline-offset-2">política de privacidad</Link>.
            </span>
          </label>
          {errors.terms && (
            <p role="alert" className="mt-1 text-sm text-reto-error">{errors.terms}</p>
          )}
        </div>
        {formError && (
          <p role="alert" className="text-sm text-reto-error">{formError}</p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-white/60">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-reto-gold underline underline-offset-2">Inicia sesión</Link>
      </p>
    </div>
  );
}

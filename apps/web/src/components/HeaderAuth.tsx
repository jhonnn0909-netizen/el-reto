// Zona de autenticación de la cabecera (cliente): muestra el usuario
// con sesión (nombre + Mi panel + Salir) o los enlaces Entrar / Crear
// cuenta cuando no hay sesión. La cabecera es un componente de servidor
// y no se vuelve a renderizar al navegar, así que este componente lee
// el usuario guardado al montar y se actualiza con el evento
// 'elreto:session' (login, registro, invitado, logout) y con 'storage'
// (otra pestaña).
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '../lib/auth';
import { getStoredUser } from '../lib/session';
import type { User } from '../lib/types';

export default function HeaderAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const refresh = () => setUser(getStoredUser());
    refresh();
    window.addEventListener('elreto:session', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('elreto:session', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  async function logout() {
    await authApi.logout();
    router.push('/');
  }

  if (user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <Link href="/panel" className="max-w-[140px] truncate text-reto-cream/80 hover:text-reto-gold">
          Hola, {user.displayName}
        </Link>
        <Link
          href="/retos/crear"
          className="hidden rounded-full bg-gradient-to-b from-reto-goldLight via-reto-gold to-reto-goldDark px-4 py-1.5 font-bold text-[#1a1206] shadow-[0_6px_22px_rgba(245,197,66,0.4)] sm:inline-block"
        >
          Crear reto
        </Link>
        <button type="button" onClick={() => void logout()} className="text-reto-cream/80 hover:text-reto-gold">
          Salir
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/login" className="text-reto-cream/80 hover:text-reto-gold">
        Entrar
      </Link>
      <Link
        href="/registro"
        className="rounded-full bg-gradient-to-b from-reto-goldLight via-reto-gold to-reto-goldDark px-4 py-1.5 font-bold text-[#1a1206] shadow-[0_6px_22px_rgba(245,197,66,0.4)]"
      >
        Crear cuenta
      </Link>
    </div>
  );
}

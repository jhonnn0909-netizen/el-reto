// Sesión local: usuario guardado (incluida la sesión de invitado) y
// preferencias de movimiento. Los tokens viven en src/lib/api.ts.
import type { User } from './types';

const USER_KEY = 'elreto.user';
const PREFS_KEY = 'elreto.prefs';

export interface Prefs {
  reduceMotion: boolean;
  disableConfetti: boolean;
  notifyNewDevice: boolean;
  /** Sonidos del juego (doc 04 D12): desactivados por defecto. */
  sounds: boolean;
  /** Vibración al ganar/perder: desactivada por defecto. */
  vibration: boolean;
}

const DEFAULT_PREFS: Prefs = {
  reduceMotion: false,
  disableConfetti: false,
  notifyNewDevice: true,
  sounds: false,
  vibration: false,
};

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User): void {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  window.localStorage.removeItem(USER_KEY);
}

export function isGuestUser(user: User | null): boolean {
  return user?.role === 'GUEST';
}

export function getPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch };
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    getPrefs().reduceMotion ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

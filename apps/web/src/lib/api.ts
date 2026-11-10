import { clearStoredUser } from './session';

// Cliente HTTP de la API de El Reto.
// - Guarda el access token en localStorage y lo envía como Bearer.
// - Ante un 401 intenta renovarlo con el refresh token (una sola vez).
// - Todas las respuestas de error siguen el formato NestJS
//   { statusCode, message, error }.

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const ACCESS_KEY = 'elreto.accessToken';
const REFRESH_KEY = 'elreto.refreshToken';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  window.localStorage.setItem(ACCESS_KEY, accessToken);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  /**
   * Si la petición llevaba token: distingue una sesión caducada (había
   * token y fue rechazado) de un visitante anónimo (sin token), para
   * no decirle «Tu sesión caducó» a quien nunca inició sesión.
   */
  hadToken: boolean;

  constructor(status: number, message: string, code?: string, hadToken = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.hadToken = hadToken;
  }
}

/**
 * Renovación del access token con el refresh token.
 * - Devuelve true si se renovó (los tokens nuevos ya están guardados).
 * - Devuelve false si NO se pudo renovar.
 * - Sin red (o error 5xx): NO se borra nada; los tokens se conservan
 *   y el siguiente intento lo reintentará.
 * - Refresh rechazado (401/403: inválido, caducado o revocado): la
 *   sesión murió de verdad; se borran tokens Y usuario guardado, para
 *   no dejar una sesión zombi que parece iniciada pero todo le da 401.
 */
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken =
    typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return false;
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearTokens();
      clearStoredUser();
    }
    return false;
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

/**
 * Una sola renovación compartida: cuando el access token caduca
 * (15 min), TODAS las peticiones en vuelo reciben 401 a la vez
 * (sondeo de presencia, latido, retos, partida cada 3 s…). Sin este
 * candado cada una renovaba por su cuenta con el MISMO refresh token
 * y el servidor, al ver el token ya rotado, revocaba TODAS las
 * sesiones de la cuenta (REFRESH_TOKEN_REUSED): la sesión moría, el
 * panel en línea se quedaba en (0) y todo daba 401 en silencio.
 */
let refreshPromise: Promise<boolean> | null = null;
function refreshAccessTokenShared(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401 && retry && token) {
    // Una sola renovación compartida (ver refreshAccessTokenShared):
    // sin ella, cada petición en vuelo renovaba por su cuenta y el
    // servidor revocaba todas las sesiones por reutilización del token.
    const refreshed = await refreshAccessTokenShared();
    if (refreshed) return apiFetch<T>(path, options, false);
    // Sin renovación no se borra nada aquí: refreshAccessToken ya
    // limpió la sesión solo si el refresh fue rechazado (401/403).
  }
  if (!res.ok) {
    let message = `Error ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (typeof body.message === 'string') message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(', ');
      code = body.error;
    } catch {
      // Respuesta sin JSON: se mantiene el mensaje genérico.
    }
    throw new ApiError(res.status, message, code, Boolean(token));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

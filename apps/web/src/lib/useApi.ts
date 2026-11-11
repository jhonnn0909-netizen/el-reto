// Hook de carga de datos con los estados de DESIGN.md §7:
// loading (esqueleto) → ok / vacío (lo decide la pantalla) / error con reintento.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export type LoadStatus = 'loading' | 'error' | 'ok';

export interface LoadResult<T> {
  status: LoadStatus;
  data: T | null;
  error: string | null;
  /** Código HTTP del error (null si no hubo error o no es HTTP). */
  errorStatus: number | null;
  reload: () => void;
}

/** Mensajes para los códigos de error del motor de juego (la API
 * devuelve el código como `message` en las respuestas 400). Sin este
 * mapa, la página de partida mostraba el código en crudo o un error
 * genérico de conexión aunque el servidor explicaba la causa real
 * (p. ej. MATCH_WAITING_OPPONENT en el reto diario). */
const GAME_ERROR_MESSAGES: Record<string, string> = {
  MATCH_WAITING_OPPONENT:
    'Esperando a un rival real. En cuanto alguien se una al reto diario, podrás jugar.',
  ALREADY_COMMITTED: 'Ya enviaste tu jugada en esta ronda.',
  WRONG_ROUND: 'La ronda ya cambió. Se está actualizando el estado…',
  ROUND_CLOSED: 'La ronda ya se cerró.',
  MATCH_NOT_PLAYABLE: 'La partida ya no está en juego.',
  NO_COMMIT: 'Primero envía tu jugada.',
  DUPLICATE_MOVE: 'Ya jugaste en esta ronda.',
  INVALID_MOVE: 'Jugada no válida.',
  INVALID_REVEAL: 'Tu jugada no coincidió con el compromiso. Inténtalo de nuevo.',
  INVALID_COMMIT_HASH: 'No se pudo preparar tu jugada. Inténtalo de nuevo.',
  CHALLENGE_NOT_OPEN: 'Este reto ya no está abierto.',
  ALREADY_IN_MATCH: 'Ya estás en una partida.',
  MATCH_NOT_FOUND: 'La partida no existe o ya terminó.',
  DAILY_SYSTEM_USER_MISSING: 'El reto del día no está disponible ahora mismo.',
};

export function gameErrorMessage(err: unknown): string {
  // La API devuelve el código como `message` (ApiError), pero el
  // código puede llegar también en un Error plano o en un objeto con
  // `.code`: se busca en todas las formas.
  const code =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? String((err as { code?: unknown; message?: unknown }).code ?? (err as { message?: unknown }).message ?? '')
        : '';
  const mapped = GAME_ERROR_MESSAGES[code];
  if (mapped) return mapped;
  return apiErrorMessage(err);
}

/** Código HTTP de un error, venga en un ApiError o en un Error plano
 * con `.status`. */
export function errorStatusOf(err: unknown): number | null {
  if (err instanceof ApiError) return err.status;
  if (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { status?: unknown }).status === 'number'
  ) {
    return (err as { status: number }).status;
  }
  return null;
}

export function apiErrorMessage(err: unknown): string {
  // El código HTTP puede venir en un ApiError o en un Error plano
  // con `.status` (p. ej. en pruebas o en errores envueltos).
  const status =
    err instanceof ApiError
      ? err.status
      : typeof err === 'object' &&
          err !== null &&
          typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : null;
  if (status === 0) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  // 401 sin token = visitante anónimo, no sesión caducada: invitación
  // neutra a entrar en vez de «Tu sesión caducó» (defecto 6e).
  if (status === 401)
    return err instanceof ApiError && err.hadToken
      ? 'Tu sesión caducó. Inicia sesión de nuevo.'
      : 'Inicia sesión para ver esto.';
  if (status === 403) return 'No tienes permiso para hacer esto.';
  if (status === 404) return 'Esto ya no existe. Puede que haya terminado o se haya cancelado.';
  if (status !== null && status >= 500) return 'Algo salió mal de nuestro lado. Inténtalo en unos minutos.';
  if (err instanceof ApiError) return err.message || 'Algo salió mal. Inténtalo de nuevo.';
  if (err instanceof TypeError) {
    return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  }
  return 'Algo salió mal. Inténtalo de nuevo.';
}

export function useApiData<T>(
  fetcher: () => Promise<T>,
  depsKey: string,
  pollMs?: number,
  /** Datos iniciales (p. ej. la última lista de presencia conocida):
   * se muestran de inmediato mientras se refresca, en vez de un
   * estado de carga vacío. */
  initialData?: T | null,
): LoadResult<T> {
  const [status, setStatus] = useState<LoadStatus>(
    initialData ? 'ok' : 'loading',
  );
  const [data, setData] = useState<T | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // Espejo de `data` para decidir dentro del efecto si ya hay datos
  // que conservar durante los refrescos (el estado `data` del
  // cierre quedaría obsoleto).
  const dataRef = useRef<T | null>(initialData ?? null);

  useEffect(() => {
    let cancelled = false;
    // En los refrescos periódicos no se vuelve al estado de carga si
    // ya hay datos: antes cada sondeo (20 s) ponía el panel de
    // personas en línea en «Cargando…» y borraba la lista visible
    // durante segundos. Solo la primera carga muestra el esqueleto.
    setStatus((prev) => (prev === 'ok' && dataRef.current ? 'ok' : 'loading'));
    setError(null);
    setErrorStatus(null);
    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        dataRef.current = result;
        setData(result);
        setStatus('ok');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(apiErrorMessage(err));
        setErrorStatus(errorStatusOf(err));
        // Con datos previos se conserva la lista visible aunque el
        // refresco falle (el error solo se muestra en la primera carga).
        setStatus((prev) => (dataRef.current ? prev : 'error'));
      });
    // Refresco periódico opcional (p. ej. la lista de personas en
    // línea, que cambia sin que el usuario haga nada).
    let interval: ReturnType<typeof setInterval> | undefined;
    if (pollMs && pollMs > 0) {
      interval = setInterval(() => {
        if (!cancelled) setNonce((n) => n + 1);
      }, pollMs);
    }
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, nonce, pollMs]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { status, data, error, errorStatus, reload };
}

/** Normaliza respuestas paginadas o listas simples. Acepta tanto
 * `data` (billetera, admin) como `items` (retos y partidas de la API
 * de juego): antes solo se leía `data` y las listas de retos públicos
 * y de partidas llegaban siempre vacías aunque la API devolviera retos
 * y partidas, así que la portada y /retos decían «No hay retos» y
 * /partidas «Aún no tienes partidas». */
export function asList<T>(
  res:
    | { data?: T[]; items?: T[]; total?: number; page?: number; limit?: number }
    | T[]
    | null
    | undefined,
): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.data ?? res.items ?? [];
}

export function asTotal<T>(res: { total: number } | T[] | null | undefined, list: T[]): number {
  if (res && !Array.isArray(res) && typeof res.total === 'number') return res.total;
  return list.length;
}

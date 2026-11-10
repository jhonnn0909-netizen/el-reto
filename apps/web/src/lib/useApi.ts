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
  reload: () => void;
}

export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
    if (err.status === 401) return 'Tu sesión caducó. Inicia sesión de nuevo.';
    if (err.status === 403) return 'No tienes permiso para hacer esto.';
    if (err.status === 404) return 'Esto ya no existe. Puede que haya terminado o se haya cancelado.';
    if (err.status >= 500) return 'Algo salió mal de nuestro lado. Inténtalo en unos minutos.';
    return err.message || 'Algo salió mal. Inténtalo de nuevo.';
  }
  if (err instanceof TypeError) {
    return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  }
  return 'Algo salió mal. Inténtalo de nuevo.';
}

export function useApiData<T>(
  fetcher: () => Promise<T>,
  depsKey: string,
  pollMs?: number,
): LoadResult<T> {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus('ok');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(apiErrorMessage(err));
        setStatus('error');
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
  return { status, data, error, reload };
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

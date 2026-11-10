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

export function useApiData<T>(fetcher: () => Promise<T>, depsKey: string): LoadResult<T> {
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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { status, data, error, reload };
}

/** Normaliza respuestas paginadas o listas simples. */
export function asList<T>(res: { data: T[] } | T[] | null | undefined): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  return res.data ?? [];
}

export function asTotal<T>(res: { total: number } | T[] | null | undefined, list: T[]): number {
  if (res && !Array.isArray(res) && typeof res.total === 'number') return res.total;
  return list.length;
}

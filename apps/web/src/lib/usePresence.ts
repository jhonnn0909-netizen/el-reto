// Lista de personas en línea con caché de la última conocida:
// al cambiar de página se muestra la lista anterior de inmediato
// mientras se refresca (20 s), en vez de «(0)» o «Cargando…».
'use client';

import { useCallback } from 'react';
import { gameApi } from './auth';
import { getCachedPresence, setCachedPresence } from './presence-cache';
import { useApiData, type LoadResult } from './useApi';
import type { OnlinePerson } from './types';

export function usePresence(depsKey: string): LoadResult<OnlinePerson[]> {
  return useApiData<OnlinePerson[]>(
    useCallback(async () => {
      const list = await gameApi.presence();
      // La API devuelve una lista; si llegara otra cosa, el panel
      // recibiría un objeto y fallaría (`people.map is not a function`).
      const safe = Array.isArray(list) ? list : [];
      setCachedPresence(safe);
      return safe;
    }, []),
    depsKey,
    20000,
    getCachedPresence(),
  );
}

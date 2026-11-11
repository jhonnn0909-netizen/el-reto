// Ronda 4: mensajes de error reales del juego, caché de presencia y
// estado de carga sin «Cargando…» fantasma.
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { gameErrorMessage, useApiData, type LoadResult } from '../useApi';
import { getCachedPresence, setCachedPresence } from '../presence-cache';
import type { OnlinePerson } from '../types';

describe('gameErrorMessage', () => {
  it('explica que el reto diario espera a un rival real', () => {
    expect(gameErrorMessage(new Error('MATCH_WAITING_OPPONENT'))).toMatch(
      /Esperando a un rival real/,
    );
    expect(gameErrorMessage({ code: 'MATCH_WAITING_OPPONENT' })).toMatch(
      /Esperando a un rival real/,
    );
  });

  it('explica la jugada ya enviada en vez de un error genérico', () => {
    expect(gameErrorMessage(new Error('ALREADY_COMMITTED'))).toMatch(
      /Ya enviaste tu jugada/,
    );
    expect(gameErrorMessage(new Error('ALREADY_IN_MATCH'))).toMatch(/Ya estás/);
  });

  it('403 es permiso y 404 es «ya no existe», no errores de conexión', () => {
    const forbidden = new Error('Forbidden') as Error & { status?: number };
    forbidden.status = 403;
    expect(gameErrorMessage(forbidden)).toMatch(/No tienes permiso/);
    const missing = new Error('Not found') as Error & { status?: number };
    missing.status = 404;
    expect(gameErrorMessage(missing)).toMatch(/ya no existe/);
  });

  it('sin respuesta del servidor sí es un problema de conexión', () => {
    expect(gameErrorMessage(new TypeError('Failed to fetch'))).toMatch(
      /Sin conexión/,
    );
  });
});

describe('caché de presencia (última lista conocida)', () => {
  it('guarda y devuelve la última lista', () => {
    const people: OnlinePerson[] = [
      { id: 'u1', username: 'Jhon', status: 'LIBRE' },
      { id: 'u2', username: 'Alcon', status: 'JUGANDO' },
    ];
    setCachedPresence(people);
    expect(getCachedPresence()).toEqual(people);
  });

  it('no guarda una respuesta que no es una lista (no rompe el panel)', () => {
    setCachedPresence([{ id: 'u1', username: 'Jhon', status: 'LIBRE' }]);
    setCachedPresence({} as unknown as OnlinePerson[]);
    expect(getCachedPresence()).toEqual([
      { id: 'u1', username: 'Jhon', status: 'LIBRE' },
    ]);
  });
});

describe('useApiData con datos iniciales', () => {
  it('arranca en «ok» con los datos en caché, sin pasar por «loading»', async () => {
    const seeded: OnlinePerson[] = [
      { id: 'u1', username: 'Jhon', status: 'LIBRE' },
    ];
    const fetcher = vi.fn().mockResolvedValue(seeded);
    const { result } = renderHook(() =>
      useApiData(fetcher, 'presence-seed', 0, seeded),
    );
    expect(result.current.status).toBe('ok');
    expect(result.current.data).toEqual(seeded);
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
  });

  it('expone el código de estado del error para ocultar «Reintentar» en 403', async () => {
    const err = new Error('Forbidden') as Error & { status?: number };
    err.status = 403;
    const { result } = renderHook(() =>
      useApiData(vi.fn().mockRejectedValue(err), 'presence-403', 0),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect((result.current as LoadResult<unknown>).errorStatus).toBe(403);
  });

  it('si el refresco falla, conserva los datos anteriores en vez de vaciar', async () => {
    const first = [{ id: 'u1', username: 'Jhon', status: 'LIBRE' as const }];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useApiData(fetcher, 'presence-stale', 0));
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.data).toEqual(first);
    // Refresco manual que falla: los datos siguen ahí.
    result.current.reload();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('ok');
    expect(result.current.data).toEqual(first);
  });
});

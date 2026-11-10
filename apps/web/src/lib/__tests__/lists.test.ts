// asList y movementSign: normalización de listas y signo de movimientos.
import { describe, expect, it } from 'vitest';
import { asList } from '../useApi';
import { movementSign } from '../format';

describe('asList', () => {
  it('acepta `items` (retos y partidas de la API de juego)', () => {
    expect(asList({ items: [1, 2], total: 2, page: 1, limit: 20 })).toEqual([1, 2]);
  });

  it('acepta `data` (billetera y admin)', () => {
    expect(asList({ data: [3], total: 1, page: 1, limit: 20 })).toEqual([3]);
  });

  it('acepta listas simples y vacíos', () => {
    expect(asList([4])).toEqual([4]);
    expect(asList(null)).toEqual([]);
    expect(asList(undefined)).toEqual([]);
  });
});

describe('movementSign', () => {
  it('CREDIT es + verde, DEBIT es − rojo y NEUTRAL no lleva signo', () => {
    expect(movementSign('CREDIT')).toEqual({ sign: '+', className: 'text-reto-success' });
    expect(movementSign('DEBIT')).toEqual({ sign: '−', className: 'text-reto-error' });
    expect(movementSign('NEUTRAL')).toEqual({ sign: '', className: 'text-white/60' });
  });
});

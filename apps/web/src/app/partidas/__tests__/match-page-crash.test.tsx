// Reproducción de la excepción del cliente en la página de partida
// (ronda 3, defecto 1): la página debe sobrevivir a todos los eventos
// que el servidor puede enviarle — match:state con el estado del reto
// diario (rival de sistema «el-reto»), round:result de timeout (una
// jugada null), match:finished en empate (winnerId null) y
// match:cancelled — sin lanzar una excepción de renderizado.
// La API se simula con fetch; el socket con un falso controlable.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ id: 'match-daily' }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/partidas/match-daily',
}));

type Handler = (payload?: unknown) => void;

class FakeSocket {
  handlers: Record<string, Handler[]> = {};
  emitted: Array<{ event: string; payload: unknown }> = [];
  connected = true;
  on(event: string, handler: Handler) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }
  off(event: string) {
    delete this.handlers[event];
    return this;
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }
  disconnect() {
    this.connected = false;
    return this;
  }
  fire(event: string, payload?: unknown) {
    for (const h of this.handlers[event] ?? []) h(payload);
  }
}

const fakeSocket = new FakeSocket();

vi.mock('../../../lib/ws', () => ({
  getGameSocket: () => fakeSocket,
  disconnectGameSocket: () => undefined,
}));

import MatchPage from '../[id]/page';

const USER = {
  id: 'user-1',
  username: 'auditora',
  displayName: 'Auditora',
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-11-10T00:00:00.000Z',
};

/** Estado exacto que devuelve la API para el reto diario en espera:
 * jugador 1 = usuaria, jugador 2 = usuario de sistema «el-reto»,
 * formato BEST_OF_5, WAITING. (Ver GameService.buildMatchState.) */
const DAILY_STATE = {
  id: 'match-daily',
  challengeId: 'challenge-daily',
  format: 'BEST_OF_5',
  gameType: 'RPS',
  stakeCredits: 0,
  status: 'WAITING',
  currentRound: 1,
  score: { player1: 0, player2: 0 },
  player1Id: 'user-1',
  player2Id: 'system-el-reto',
  player1Username: 'auditora',
  player2Username: 'el-reto',
  score1: 0,
  score2: 0,
  players: [
    { id: 'user-1', username: 'auditora', displayName: 'Auditora' },
    { id: 'system-el-reto', username: 'el-reto', displayName: 'Esperando rival' },
  ],
  winnerId: null,
  startedAt: null,
  finishedAt: null,
  timeoutSeconds: 30,
  isDaily: true,
  asSpectator: false,
  round: {
    number: 1,
    startedAt: '2026-11-10T12:00:00.000Z',
    committed: { me: false, opponent: false },
    myMove: null,
  },
  rounds: [],
  spectators: { count: 0, names: [] },
};

function installFetch() {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/matches/')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => DAILY_STATE });
    }
    if (url.includes('/presence/online')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('elreto.user', JSON.stringify(USER));
  window.localStorage.setItem('elreto.accessToken', 'test-token');
  window.localStorage.setItem('elreto.refreshToken', 'test-refresh');
  fakeSocket.handlers = {};
  fakeSocket.emitted = [];
  fakeSocket.connected = true;
  // No vi.restoreAllMocks(): borraría el mock de window.matchMedia
  // instalado en setup.tsx y prefersReducedMotion rompería.
});

describe('Página de partida: excepción del cliente (defecto 1)', () => {
  it('el reto diario en espera se renderiza y sobrevive a match:state', async () => {
    installFetch();
    render(<MatchPage />);
    // La arena aparece con el rival de sistema.
    expect((await screen.findAllByText('el-reto')).length).toBeGreaterThan(0);
    expect(screen.getByText('Mejor de 5')).toBeInTheDocument();
    act(() => {
      fakeSocket.fire('connect');
      fakeSocket.fire('match:state', { ...DAILY_STATE });
    });
    expect(screen.getAllByText('el-reto').length).toBeGreaterThan(0);
  });

  it('sobrevive a round:result de timeout (una jugada null) y a match:finished en empate', async () => {
    installFetch();
    render(<MatchPage />);
    await screen.findAllByText('el-reto');
    act(() => {
      fakeSocket.fire('connect');
      // Timeout: solo la jugadora reveló; la jugada del rival es null
      // y el servidor envía score y reason TIMEOUT.
      fakeSocket.fire('round:result', {
        matchId: 'match-daily',
        round: 1,
        moves: { player1: 'ROCK', player2: null },
        result: 'PLAYER1',
        score: { player1: 1, player2: 0 },
        reason: 'TIMEOUT',
      });
      // Empate: winnerId null.
      fakeSocket.fire('match:finished', {
        matchId: 'match-daily',
        winnerId: null,
        score: { player1: 0, player2: 0 },
        payout: 0,
        dailyPrize: 0,
        reason: 'TIMEOUT_DRAW',
      });
    });
    // La página sigue viva (no aparece la página negra de error).
    expect(screen.getAllByText('el-reto').length).toBeGreaterThan(0);
  });

  it('sobrevive a match:cancelled con el estado de partida cancelada', async () => {
    installFetch();
    render(<MatchPage />);
    await screen.findAllByText('el-reto');
    act(() => {
      fakeSocket.fire('connect');
      fakeSocket.fire('match:state', { ...DAILY_STATE, status: 'CANCELLED' });
      fakeSocket.fire('match:cancelled', { matchId: 'match-daily', reason: 'NO_SHOW_TIMEOUT' });
    });
    expect(screen.getAllByText('el-reto').length).toBeGreaterThan(0);
  });

  it('la vista de espectador sobrevive a match:state y round:result', async () => {
    installFetch();
    // Espectadora: ni jugadora 1 ni jugadora 2.
    window.localStorage.setItem(
      'elreto.user',
      JSON.stringify({ ...USER, id: 'user-9', username: 'mirona', displayName: 'Mirona' }),
    );
    render(<MatchPage />);
    await screen.findAllByText('el-reto');
    act(() => {
      fakeSocket.fire('connect');
      fakeSocket.fire('match:state', { ...DAILY_STATE, asSpectator: true });
      fakeSocket.fire('round:result', {
        matchId: 'match-daily',
        round: 1,
        moves: { player1: 'PAPER', player2: 'SCISSORS' },
        result: 'PLAYER2',
        score: { player1: 0, player2: 1 },
      });
    });
    expect(screen.getByText(/Estás viendo esta partida como espectador/)).toBeInTheDocument();
  });
});

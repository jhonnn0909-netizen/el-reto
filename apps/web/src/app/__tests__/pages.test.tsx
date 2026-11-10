// Al menos una prueba por pantalla principal: renderiza sus estados
// vacío / carga / error. La API se simula con fetch (mocks); nunca
// se llama a una API real.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '../page';
import ChallengesPage from '../retos/page';
import MatchesPage from '../partidas/page';
import RankingPage from '../ranking/page';
import LoginPage from '../login/page';
import RegisterPage from '../registro/page';
import HelpPage from '../ayuda/page';
import NotificationsPage from '../notificaciones/page';

type FetchHandler = (url: string) => unknown;

function installFetch(handler: FetchHandler) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    const result = handler(url);
    if (result instanceof Error) return Promise.reject(result);
    const { ok = true, status = 200, body = {} } = result as {
      ok?: boolean;
      status?: number;
      body?: unknown;
    };
    return Promise.resolve({ ok, status, json: async () => body });
  }) as unknown as typeof fetch;
}

const emptyPage = { data: [], page: 1, limit: 20, total: 0 };

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('Inicio', () => {
  it('renderiza el titular, el aviso DEMO y el estado vacío de retos', async () => {
    installFetch((url) => {
      if (url.includes('/challenges/daily')) return { ok: false, status: 404, body: { statusCode: 404, message: 'Not found', error: 'Not Found' } };
      if (url.includes('/challenges')) return { body: emptyPage };
      return { body: {} };
    });
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reta a quien quieras. Gana en segundos.');
    expect(screen.getByText(/Aquí no se juega con dinero real/)).toBeInTheDocument();
    expect(await screen.findByText('No hay retos públicos ahora mismo.')).toBeInTheDocument();
  });

  it('muestra el estado de error con reintento cuando la API no responde', async () => {
    installFetch(() => new Error('Network error'));
    render(<HomePage />);
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('Retos', () => {
  it('renderiza el estado vacío y la lista en línea vacía', async () => {
    installFetch((url) => {
      if (url.includes('/presence/online')) return { body: [] };
      return { body: emptyPage };
    });
    render(<ChallengesPage />);
    expect(await screen.findByText('No hay retos públicos ahora mismo.')).toBeInTheDocument();
    expect(screen.getByText(/No hay nadie en línea ahora mismo/)).toBeInTheDocument();
  });

  it('muestra los retos públicos cuando la API devuelve `items`', async () => {
    installFetch((url) => {
      if (url.includes('/presence/online')) return { body: [] };
      if (url.includes('/challenges')) {
        return {
          body: {
            items: [
              {
                id: 'c1',
                creatorId: 'u1',
                creatorUsername: 'Alcon',
                visibility: 'PUBLIC',
                format: 'BEST_OF_3',
                stakeCredits: 0,
                status: 'OPEN',
                expiresAt: new Date(Date.now() + 3600_000).toISOString(),
                createdAt: new Date().toISOString(),
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          },
        };
      }
      return { body: {} };
    });
    render(<ChallengesPage />);
    expect(await screen.findByText('Alcon')).toBeInTheDocument();
    expect(screen.queryByText('No hay retos públicos ahora mismo.')).not.toBeInTheDocument();
  });
});

describe('Historial de partidas', () => {
  const matchBase = {
    challengeId: 'ch1',
    format: 'BEST_OF_3',
    stakeCredits: 50,
    currentRound: 1,
    createdAt: new Date().toISOString(),
  };
  it('muestra el marcador desde la perspectiva del usuario y «Cancelada» en vez de «Empate»', async () => {
    window.localStorage.setItem('elreto.user', JSON.stringify({ id: 'me', username: 'yo' }));
    installFetch((url) => {
      if (url.includes('/matches')) {
        return {
          body: {
            items: [
              {
                ...matchBase,
                id: 'm1',
                player1Id: 'u1',
                player1Username: 'Alcon',
                player2Id: 'me',
                player2Username: 'yo',
                status: 'FINISHED',
                score1: 0,
                score2: 1,
                winnerId: 'me',
              },
              {
                ...matchBase,
                id: 'm2',
                player1Id: 'me',
                player1Username: 'yo',
                player2Id: 'u1',
                player2Username: 'Alcon',
                status: 'CANCELLED',
                score1: 0,
                score2: 0,
                winnerId: null,
              },
            ],
            total: 2,
            page: 1,
            limit: 20,
          },
        };
      }
      return { body: {} };
    });
    render(<MatchesPage />);
    // Victoria como jugador 2: el marcador se lee 1–0 (mi marcador
    // primero), no 0–1 como antes.
    expect(await screen.findByText('Victoria')).toBeInTheDocument();
    expect(screen.getByText('1–0')).toBeInTheDocument();
    // «Cancelada» aparece como filtro y como insignia de la partida;
    // «Empate» solo como filtro (ninguna partida se etiqueta así).
    expect(screen.getAllByText('Cancelada')).toHaveLength(2);
    expect(screen.getAllByText('Empate')).toHaveLength(1);
  });
});

describe('Ranking', () => {
  it('renderiza el estado vacío cuando no hay posiciones', async () => {
    installFetch(() => ({ body: [] }));
    render(<RankingPage />);
    expect(await screen.findByText('Aún no hay ranking.')).toBeInTheDocument();
  });

  it('muestra el estado de error con reintento cuando la API falla', async () => {
    installFetch(() => new Error('Network error'));
    render(<RankingPage />);
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('Login y registro', () => {
  it('el login renderiza su formulario', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Inicia sesión' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo electrónico o nombre de usuario/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('el registro renderiza su formulario con sus campos', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Crea tu cuenta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de usuario')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
  });
});

describe('Ayuda', () => {
  it('renderiza el buscador, los temas y las preguntas frecuentes', () => {
    render(<HelpPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Centro de ayuda' })).toBeInTheDocument();
    expect(screen.getByLabelText('¿En qué te ayudamos?')).toBeInTheDocument();
    expect(screen.getByText('¿Necesito una cuenta para jugar?')).toBeInTheDocument();
  });

  it('la búsqueda sin resultados muestra el estado vacío', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(<HelpPage />);
    fireEvent.change(screen.getByLabelText('¿En qué te ayudamos?'), { target: { value: 'zzzqqq' } });
    expect(await screen.findByText(/No encontramos nada con ese filtro/)).toBeInTheDocument();
  });
});

describe('Notificaciones', () => {
  it('renderiza el estado vacío cuando no hay notificaciones', async () => {
    installFetch(() => ({ body: emptyPage }));
    render(<NotificationsPage />);
    expect(await screen.findByText('No tienes notificaciones nuevas.')).toBeInTheDocument();
  });
});

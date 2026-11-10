// Al menos una prueba por pantalla principal: renderiza sus estados
// vacío / carga / error. La API se simula con fetch (mocks); nunca
// se llama a una API real.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '../page';
import ChallengesPage from '../retos/page';
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
    expect(screen.getByText(/Eres la única persona en línea ahora/)).toBeInTheDocument();
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

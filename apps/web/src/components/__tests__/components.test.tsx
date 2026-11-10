// ChallengeCard, OnlineList, Countdown y Hands.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import ChallengeCard from '../ChallengeCard';
import OnlineList from '../OnlineList';
import Countdown from '../Countdown';
import { Hand, HandsRow } from '../Hands';
import type { Challenge, OnlinePerson } from '../../lib/types';

const challenge: Challenge = {
  id: 'c1',
  creatorId: 'u1',
  creatorUsername: 'Alcon',
  visibility: 'PUBLIC',
  format: 'BEST_OF_3',
  stakeCredits: 500,
  status: 'OPEN',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
};

const people: OnlinePerson[] = [
  { userId: 'u1', username: 'Alcon', status: 'LIBRE' },
  { userId: 'u2', username: 'Naya', status: 'JUGANDO' },
  { userId: 'u3', username: 'Rival', status: 'RETO PENDIENTE' },
];

describe('ChallengeCard', () => {
  it('muestra creador, formato, premio DEMO, estado y tiempo', () => {
    render(<ChallengeCard challenge={challenge} />);
    expect(screen.getByText('Alcon')).toBeInTheDocument();
    expect(screen.getByText('Mejor de 3')).toBeInTheDocument();
    expect(screen.getByText(/500 créditos DEMO/)).toBeInTheDocument();
    expect(screen.getByText('DEMO')).toBeInTheDocument();
    expect(screen.getByText(/Abierto/)).toBeInTheDocument();
    expect(screen.getByText(/hace 2 min/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aceptar reto/ })).toBeInTheDocument();
  });

  it('sin premio no muestra cifra DEMO', () => {
    render(<ChallengeCard challenge={{ ...challenge, stakeCredits: 0 }} />);
    expect(screen.queryByText(/créditos DEMO/)).not.toBeInTheDocument();
  });
});

describe('OnlineList', () => {
  it('muestra el contador, los estados y la leyenda', () => {
    render(<OnlineList people={people} />);
    expect(screen.getByText(/Personas en línea/)).toBeInTheDocument();
    expect(screen.getByText(/Personas en línea/)).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getAllByText('LIBRE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('JUGANDO').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RETO PENDIENTE').length).toBeGreaterThan(0);
    expect(screen.getByText(/Leyenda de estados/)).toBeInTheDocument();
  });

  it('la persona por invitar aparece aparte', () => {
    render(<OnlineList people={people} inviteeName="InvitadoNuevo" />);
    expect(screen.getByText('Por invitar')).toBeInTheDocument();
    expect(screen.getByText('InvitadoNuevo')).toBeInTheDocument();
    expect(screen.getByText('POR INVITAR')).toBeInTheDocument();
  });

  it('sin personas muestra el estado vacío', () => {
    render(<OnlineList people={[]} />);
    expect(screen.getByText(/No hay nadie en línea ahora mismo/)).toBeInTheDocument();
  });

  it('cada LIBRE tiene botón Retar', () => {
    render(<OnlineList people={people} onChallenge={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: 'Retar' })).toHaveLength(1);
  });

  it('el usuario actual se marca como «Tú» y no se le puede retar', () => {
    render(<OnlineList people={people} meId="u1" onChallenge={vi.fn()} />);
    expect(screen.getByText('(tú)')).toBeInTheDocument();
    // Solo hay un LIBRE (Alcon, que es el propio usuario): sin botón Retar.
    expect(screen.queryByRole('button', { name: 'Retar' })).not.toBeInTheDocument();
  });
});

describe('Countdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('empieza con ¡PIEDRA! y avanza con la cadencia', () => {
    vi.useFakeTimers();
    render(<Countdown />);
    expect(screen.getByText('¡PIEDRA!')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText('¡PAPEL!')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText('¡TIJERAS!')).toBeInTheDocument();
  });
});

describe('Hands', () => {
  it('las tres manos son FOTOS reales con su nombre, no emojis ni dibujos', () => {
    render(<HandsRow />);
    expect(screen.getByRole('img', { name: 'Mano real: piedra' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mano real: papel' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Mano real: tijera' })).toBeInTheDocument();
    expect(screen.getByText('Piedra')).toBeInTheDocument();
    expect(screen.getByText('Papel')).toBeInTheDocument();
    expect(screen.getByText('Tijera')).toBeInTheDocument();
  });

  it('cada foto de mano tiene su etiqueta accesible y su archivo real', () => {
    render(<Hand move="SCISSORS" />);
    const img = screen.getByRole('img', { name: 'Mano real: tijera' });
    expect(img.getAttribute('src')).toBe('/img/mano-tijera.jpg');
  });
});

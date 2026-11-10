// Pruebas de la ampliación de alcance: WinnerCard, sonidos/vibración
// por defecto, modo espectador, tarjetas «Próximamente», rachas y niveles.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WinnerCard from '../WinnerCard';
import { GameCard, FALLBACK_GAMES } from '../GameCard';
import RankingTable from '../RankingTable';
import GameArena from '../GameArena';
import { soundsEnabled, vibrationEnabled } from '../../lib/sounds';
import type { Match, RankingEntry } from '../../lib/types';

const match: Match = {
  id: 'm1',
  challengeId: 'c1',
  player1Id: 'u1',
  player2Id: 'u2',
  player1Username: 'Jhon',
  player2Username: 'Alcon',
  format: 'BEST_OF_3',
  stakeCredits: 0,
  status: 'IN_PROGRESS',
  currentRound: 1,
  score1: 1,
  score2: 0,
  createdAt: new Date().toISOString(),
};

const entries: RankingEntry[] = [
  {
    userId: 'u1',
    username: 'Jhon',
    wins: 12,
    losses: 3,
    ties: 1,
    matchesPlayed: 16,
    points: 36,
    position: 1,
    currentStreak: 5,
    bestStreak: 8,
    level: 4,
    levelTitle: 'Retador',
  },
];

describe('WinnerCard', () => {
  it('renderiza el resultado, el marcador y los nombres', () => {
    render(
      <WinnerCard
        winnerName="Jhon"
        loserName="Alcon"
        scoreWinner={2}
        scoreLoser={1}
        formatLabel="Mejor de 3"
        matchId="m1"
        finishedAt={new Date().toISOString()}
        isWinner
      />,
    );
    expect(screen.getByText('¡Ganaste la partida!')).toBeInTheDocument();
    expect(screen.getByText('2–1')).toBeInTheDocument();
    expect(screen.getByText(/Jhon contra Alcon/)).toBeInTheDocument();
    expect(screen.getByText(/Mejor de 3/)).toBeInTheDocument();
  });

  it('ofrece compartir por WhatsApp, Facebook y copiar enlace', () => {
    render(
      <WinnerCard
        winnerName="Jhon"
        loserName="Alcon"
        scoreWinner={2}
        scoreLoser={1}
        formatLabel="Mejor de 3"
        matchId="m1"
        finishedAt={new Date().toISOString()}
        isWinner
      />,
    );
    const wa = screen.getByRole('link', { name: /WhatsApp/ });
    expect(wa.getAttribute('href')).toContain('wa.me/?text=');
    expect(wa.getAttribute('href')).toContain('partidas%2Fm1');
    const fb = screen.getByRole('link', { name: /Facebook/ });
    expect(fb.getAttribute('href')).toContain('facebook.com/sharer/sharer.php?u=');
    expect(screen.getByRole('button', { name: /Copiar enlace/ })).toBeInTheDocument();
  });
});

describe('Sonidos y vibración (doc 04 D12)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('sonidos desactivados por defecto', () => {
    expect(soundsEnabled()).toBe(false);
  });

  it('vibración desactivada por defecto', () => {
    expect(vibrationEnabled()).toBe(false);
  });
});

describe('Modo espectador', () => {
  it('no muestra botones de jugada y avisa de que es solo lectura', () => {
    render(
      <GameArena
        match={match}
        meId="u3"
        meName="Espectador"
        opponentName="Alcon"
        connection="connected"
        spectator
        onMove={vi.fn()}
        onRematch={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    expect(screen.getByText(/Estás viendo esta partida como espectador/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Piedra/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Papel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tijera/ })).not.toBeInTheDocument();
    // El marcador sigue visible (Alcon aparece en el marcador y en su zona).
    expect(screen.getByText('Jhon')).toBeInTheDocument();
    expect(screen.getAllByText('Alcon')).toHaveLength(2);
  });

  it('un jugador sí ve los botones de jugada', () => {
    render(
      <GameArena
        match={match}
        meId="u1"
        meName="Jhon"
        opponentName="Alcon"
        connection="connected"
        onMove={vi.fn()}
        onRematch={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Piedra/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Papel/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tijera/ })).toBeInTheDocument();
  });

  it('espectador de una partida terminada: marcador neutro, sin «Perdiste» ni espera', () => {
    const finished: Match = {
      ...match,
      status: 'FINISHED',
      score1: 0,
      score2: 1,
      winnerId: 'u2',
      finishedAt: new Date().toISOString(),
    };
    render(
      <GameArena
        match={finished}
        meId="u3"
        meName="Espectador"
        opponentName="Alcon"
        connection="connected"
        spectator
        onMove={vi.fn()}
        onRematch={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    // El marcador no se invierte: Jhon (jugador 1) 0, Alcon (jugador 2) 1.
    expect(screen.getByLabelText('Marcador de Jhon: 0')).toBeInTheDocument();
    expect(screen.getByLabelText('Marcador de Alcon: 1')).toBeInTheDocument();
    // Texto neutro con el ganador, nunca «Perdiste» para quien no jugó.
    expect(screen.getByText('Ganó Alcon 0–1')).toBeInTheDocument();
    expect(screen.queryByText(/Perdiste/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ganaste/)).not.toBeInTheDocument();
    // Nada de «Esperando a tu rival…» en una partida terminada.
    expect(screen.queryByText(/Esperando a tu rival/)).not.toBeInTheDocument();
    expect(screen.getByText('Partida terminada.')).toBeInTheDocument();
    // El anuncio para lectores de pantalla también es neutro.
    expect(screen.getByText('Ganó Alcon 0–1.')).toBeInTheDocument();
    expect(screen.queryByText(/Vas /)).not.toBeInTheDocument();
  });

  it('espectador en vivo: el anuncio no dice «Vas» ni «Ganas/Pierdes la ronda»', () => {
    render(
      <GameArena
        match={match}
        meId="u3"
        meName="Espectador"
        opponentName="Alcon"
        connection="connected"
        spectator
        onMove={vi.fn()}
        onRematch={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    // Anuncio inicial neutro: nombres y marcador, sin segunda persona.
    expect(screen.getByText(/Jhon 1 a 0 Alcon/)).toBeInTheDocument();
    expect(screen.queryByText(/Vas /)).not.toBeInTheDocument();
  });

  it('espectador con resultado de ronda: anuncia quién ganó la ronda', () => {
    render(
      <GameArena
        match={match}
        meId="u3"
        meName="Espectador"
        opponentName="Alcon"
        connection="connected"
        spectator
        roundResult={{ myMove: 'ROCK', rivalMove: 'SCISSORS' }}
        onMove={vi.fn()}
        onRematch={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    // Piedra (Jhon, jugador 1) rompe Tijera: gana Jhon, no «Ganas».
    // La frase aparece dos veces: anuncio para lectores de pantalla
    // y tarjeta visible del resultado de la ronda.
    expect(screen.getAllByText(/Jhon gana la ronda/)).toHaveLength(2);
    expect(screen.queryByText(/Ganas la ronda/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pierdes la ronda/)).not.toBeInTheDocument();
  });

  it('jugador que pierde ve «Perdiste» con su marcador a la izquierda', () => {
    const finished: Match = {
      ...match,
      status: 'FINISHED',
      score1: 0,
      score2: 1,
      winnerId: 'u2',
      finishedAt: new Date().toISOString(),
    };
    render(
      <GameArena
        match={finished}
        meId="u1"
        meName="Jhon"
        opponentName="Alcon"
        connection="connected"
        onMove={vi.fn()}
        onRematch={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    expect(screen.getByText('Perdiste 0–1')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu marcador: 0')).toBeInTheDocument();
  });
});

describe('Tarjetas de juegos', () => {
  it('piedra, papel o tijera es jugable', () => {
    const rps = FALLBACK_GAMES.find((g) => g.slug === 'RPS')!;
    render(<GameCard game={rps} />);
    expect(screen.getByRole('link', { name: /Jugar ahora/ })).toBeInTheDocument();
  });

  it('damas, damas chinas y conecta cuatro son «Próximamente» y no jugables', () => {
    for (const slug of ['CHECKERS', 'CHINESE_CHECKERS', 'CONNECT_FOUR']) {
      const game = FALLBACK_GAMES.find((g) => g.slug === slug)!;
      const { unmount } = render(<GameCard game={game} />);
      expect(screen.getAllByText('Próximamente').length).toBeGreaterThan(0);
      expect(screen.queryByRole('link', { name: /Jugar ahora/ })).not.toBeInTheDocument();
      const button = screen.getByRole('button', { name: 'Próximamente' });
      expect(button).toBeDisabled();
      unmount();
    }
  });
});

describe('Ranking con rachas y niveles', () => {
  it('muestra la racha actual, la mejor racha y el nivel con su título', () => {
    render(<RankingTable entries={entries} />);
    expect(screen.getByText(/Racha actual/)).toBeInTheDocument();
    expect(screen.getAllByText(/Mejor racha/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nv\. 4/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Retador/).length).toBeGreaterThan(0);
  });
});

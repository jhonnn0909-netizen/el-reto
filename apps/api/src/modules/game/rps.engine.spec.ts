import { computeCommitHash } from './game-engine.interface';
import { RpsEngine } from './rps.engine';

describe('RpsEngine', () => {
  const engine = new RpsEngine();

  it('resuelve las 9 combinaciones con las reglas clásicas', () => {
    expect(engine.resolveRound('ROCK', 'SCISSORS')).toBe('PLAYER1');
    expect(engine.resolveRound('SCISSORS', 'ROCK')).toBe('PLAYER2');
    expect(engine.resolveRound('SCISSORS', 'PAPER')).toBe('PLAYER1');
    expect(engine.resolveRound('PAPER', 'SCISSORS')).toBe('PLAYER2');
    expect(engine.resolveRound('PAPER', 'ROCK')).toBe('PLAYER1');
    expect(engine.resolveRound('ROCK', 'PAPER')).toBe('PLAYER2');
    expect(engine.resolveRound('ROCK', 'ROCK')).toBe('TIE');
    expect(engine.resolveRound('PAPER', 'PAPER')).toBe('TIE');
    expect(engine.resolveRound('SCISSORS', 'SCISSORS')).toBe('TIE');
  });

  it('requiredWins por formato (FREE sin meta fija)', () => {
    expect(engine.requiredWins('BEST_OF_1')).toBe(1);
    expect(engine.requiredWins('BEST_OF_3')).toBe(2);
    expect(engine.requiredWins('BEST_OF_5')).toBe(3);
    expect(engine.requiredWins('FREE')).toBeNull();
  });

  it('mejor de 3 termina al llegar a 2', () => {
    const base = { format: 'BEST_OF_3' as const, roundsPlayed: 2, consecutiveTies: 0 };
    expect(engine.isMatchFinished({ ...base, score1: 2, score2: 0 })).toEqual({
      finished: true,
      winner: 1,
    });
    expect(engine.isMatchFinished({ ...base, score1: 1, score2: 1 })).toEqual({
      finished: false,
    });
  });

  it('FREE termina con ventaja de 2 y al menos 2 rondas (regla provisional)', () => {
    const base = { format: 'FREE' as const, consecutiveTies: 0 };
    expect(
      engine.isMatchFinished({ ...base, score1: 2, score2: 0, roundsPlayed: 2 }),
    ).toEqual({ finished: true, winner: 1 });
    expect(
      engine.isMatchFinished({ ...base, score1: 1, score2: 0, roundsPlayed: 1 }),
    ).toEqual({ finished: false });
    expect(
      engine.isMatchFinished({ ...base, score1: 3, score2: 1, roundsPlayed: 4 }),
    ).toEqual({ finished: true, winner: 1 });
  });

  it('5 empates seguidos cierran la partida en empate', () => {
    expect(
      engine.isMatchFinished({
        format: 'BEST_OF_3',
        score1: 0,
        score2: 0,
        roundsPlayed: 5,
        consecutiveTies: 5,
      }),
    ).toEqual({ finished: true, draw: true });
  });

  it('el hash de compromiso es determinista y cambia con el secreto', () => {
    const h1 = computeCommitHash('ROCK', 'secreto-1');
    expect(h1).toBe(computeCommitHash('ROCK', 'secreto-1'));
    expect(h1).toHaveLength(64);
    expect(h1).not.toBe(computeCommitHash('ROCK', 'secreto-2'));
    expect(h1).not.toBe(computeCommitHash('PAPER', 'secreto-1'));
    expect(engine.computeCommitHash('ROCK', 'secreto-1')).toBe(h1);
  });
});

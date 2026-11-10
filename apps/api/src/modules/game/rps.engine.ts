import { Injectable } from '@nestjs/common';
import {
  GameEngine,
  MAX_CONSECUTIVE_TIES,
  computeCommitHash,
} from './game-engine.interface';
import { MatchFormat, Move, RoundResult } from './game.types';

/** Quién vence a quién en piedra, papel o tijera. */
const BEATS: Record<Move, Move> = {
  ROCK: 'SCISSORS',
  SCISSORS: 'PAPER',
  PAPER: 'ROCK',
};

/**
 * Motor de piedra, papel o tijera: primera implementación de GameEngine.
 * Reglas clásicas; empate repite la ronda (no suma punto).
 */
@Injectable()
export class RpsEngine implements GameEngine {
  readonly gameType = 'RPS';
  readonly validMoves: readonly string[] = ['ROCK', 'PAPER', 'SCISSORS'];

  isValidMove(move: string): boolean {
    return move === 'ROCK' || move === 'PAPER' || move === 'SCISSORS';
  }

  resolveRound(move1: string, move2: string): RoundResult {
    if (move1 === move2) return 'TIE';
    return BEATS[move1 as Move] === move2 ? 'PLAYER1' : 'PLAYER2';
  }

  requiredWins(format: MatchFormat): number | null {
    switch (format) {
      case 'BEST_OF_1':
        return 1;
      case 'BEST_OF_3':
        return 2;
      case 'BEST_OF_5':
        return 3;
      case 'FREE':
        return null;
    }
  }

  isMatchFinished(args: {
    format: MatchFormat;
    score1: number;
    score2: number;
    roundsPlayed: number;
    consecutiveTies: number;
  }): { finished: boolean; winner?: 1 | 2; draw?: boolean } {
    const { format, score1, score2, roundsPlayed, consecutiveTies } = args;
    if (consecutiveTies >= MAX_CONSECUTIVE_TIES) {
      return { finished: true, draw: true };
    }
    const target = this.requiredWins(format);
    if (target !== null) {
      if (score1 >= target) return { finished: true, winner: 1 };
      if (score2 >= target) return { finished: true, winner: 2 };
      return { finished: false };
    }
    // FREE: sin meta fija. Regla provisional (doc 07 §13.5, duda D-01
    // abierta: Jhon no ha fijado la condición de fin): ventaja de 2
    // rondas con al menos 2 rondas jugadas. Además termina por
    // abandono/cancelación (GameService), nunca por marcador 1-0.
    if (roundsPlayed >= 2 && Math.abs(score1 - score2) >= 2) {
      return { finished: true, winner: score1 > score2 ? 1 : 2 };
    }
    return { finished: false };
  }

  computeCommitHash(move: string, secret: string): string {
    return computeCommitHash(move, secret);
  }
}

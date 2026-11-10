import { createHash } from 'crypto';
import { MatchFormat, Move, RoundResult } from './game.types';

/**
 * Interfaz del motor de un juego (motor modular, CONTRACTS/DECISIONS).
 * El núcleo (GameService) solo conoce esta interfaz: validar jugadas,
 * resolver rondas y decidir el fin de partida. Cada juego futuro
 * (damas, damas chinas, conecta cuatro) implementa esta misma interfaz
 * y se registra en GameEngineRegistry sin tocar el núcleo.
 */
export interface GameEngine {
  /** Código del juego en `game_types` (p. ej. 'RPS'). */
  readonly gameType: string;
  /** Jugadas válidas del juego. */
  readonly validMoves: readonly string[];
  isValidMove(move: string): boolean;
  /** Resuelve una ronda entre dos jugadas ya verificadas. */
  resolveRound(move1: string, move2: string): RoundResult;
  /** Rondas a ganar para cerrar la partida, o null si el formato no tiene meta fija (FREE). */
  requiredWins(format: MatchFormat): number | null;
  /**
   * Decide si la partida terminó. `roundsPlayed` = rondas con ganador
   * ya resueltas; `consecutiveTies` = empates seguidos. Devuelve el
   * ganador (1 o 2), o `draw: true` si termina en empate.
   */
  isMatchFinished(args: {
    format: MatchFormat;
    score1: number;
    score2: number;
    roundsPlayed: number;
    consecutiveTies: number;
  }): { finished: boolean; winner?: 1 | 2; draw?: boolean };
  /** Hash de compromiso: SHA256(move + ":" + secret). */
  computeCommitHash(move: string, secret: string): string;
}

/** Límite de empates seguidos antes de cerrar la partida como empate (doc 07 §13.2). */
export const MAX_CONSECUTIVE_TIES = 5;

export function computeCommitHash(move: string, secret: string): string {
  return createHash('sha256').update(`${move}:${secret}`).digest('hex');
}

export function isValidMoveValue(move: string): move is Move {
  return move === 'ROCK' || move === 'PAPER' || move === 'SCISSORS';
}

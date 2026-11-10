// Lógica pura del juego (el frontend nunca decide un ganador: estas
// funciones solo formulan el texto visible; el resultado lo decide el
// backend). Ver CONTRACTS.md §4.4 y DESIGN.md §9.
import type { ChallengeFormat, Move } from './types';

export const MOVE_LABELS: Record<Move, string> = {
  ROCK: 'Piedra',
  PAPER: 'Papel',
  SCISSORS: 'Tijera',
};

export const MOVE_ORDER: Move[] = ['ROCK', 'PAPER', 'SCISSORS'];

/** 1 si gana `a`, -1 si gana `b`, 0 si empatan. */
export function winnerOf(a: Move, b: Move): 1 | -1 | 0 {
  if (a === b) return 0;
  const beats: Record<Move, Move> = {
    ROCK: 'SCISSORS',
    PAPER: 'ROCK',
    SCISSORS: 'PAPER',
  };
  return beats[a] === b ? 1 : -1;
}

const VERBS: Record<Move, string> = {
  ROCK: 'rompe',
  PAPER: 'envuelve a',
  SCISSORS: 'corta',
};

export function roundPhrase(myMove: Move, rivalMove: Move): string {
  const result = winnerOf(myMove, rivalMove);
  if (result === 0) return `¡${MOVE_LABELS[myMove]} contra ${MOVE_LABELS[rivalMove].toLowerCase()}! Empate en la ronda.`;
  if (result === 1) {
    return `¡${MOVE_LABELS[myMove]} ${VERBS[myMove]} ${MOVE_LABELS[rivalMove].toLowerCase()}! Ganas la ronda.`;
  }
  return `¡${MOVE_LABELS[rivalMove]} ${VERBS[rivalMove]} ${MOVE_LABELS[myMove].toLowerCase()}! Pierdes la ronda.`;
}

/**
 * Anuncio neutro de una ronda para espectadores: nombra al ganador de
 * la ronda en vez de decir «Ganas»/«Pierdes» a quien no juega.
 * move1/name1 son del jugador 1 y move2/name2 del jugador 2.
 */
export function roundPhraseNeutral(move1: Move, move2: Move, name1: string, name2: string): string {
  const result = winnerOf(move1, move2);
  if (result === 0) return `¡${MOVE_LABELS[move1]} contra ${MOVE_LABELS[move2].toLowerCase()}! Empate en la ronda.`;
  if (result === 1) {
    return `¡${MOVE_LABELS[move1]} ${VERBS[move1]} ${MOVE_LABELS[move2].toLowerCase()}! ${name1} gana la ronda.`;
  }
  return `¡${MOVE_LABELS[move2]} ${VERBS[move2]} ${MOVE_LABELS[move1].toLowerCase()}! ${name2} gana la ronda.`;
}

export const FORMAT_LABELS: Record<ChallengeFormat, string> = {
  BEST_OF_1: '1 ronda',
  BEST_OF_3: 'Mejor de 3',
  BEST_OF_5: 'Mejor de 5',
  FREE: 'Libre',
};

export const FORMAT_DESCRIPTIONS: Record<ChallengeFormat, string> = {
  BEST_OF_1: 'Una ronda y a casa.',
  BEST_OF_3: 'Gana quien gane 2 rondas.',
  BEST_OF_5: 'Gana quien gane 3 rondas.',
  FREE: 'Sin límite de rondas.',
};

export function roundsToWin(format: ChallengeFormat): number | null {
  switch (format) {
    case 'BEST_OF_1':
      return 1;
    case 'BEST_OF_3':
      return 2;
    case 'BEST_OF_5':
      return 3;
    default:
      return null;
  }
}

export function totalRoundsLabel(format: ChallengeFormat): string {
  switch (format) {
    case 'BEST_OF_1':
      return 'Ronda 1 de 1';
    case 'BEST_OF_3':
      return 'Mejor de 3 rondas';
    case 'BEST_OF_5':
      return 'Mejor de 5 rondas';
    default:
      return 'Formato libre';
  }
}

/** SHA-256 de `move:secret` para el commit-reveal (CONTRACTS.md §4.4). */
export async function commitHash(move: Move, secret: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const data = new TextEncoder().encode(`${move}:${secret}`);
    const digest = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Respaldo determinista solo si no hay WebCrypto (entornos de prueba).
  let h = 0x811c9dc5;
  const s = `${move}:${secret}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fallback-${(h >>> 0).toString(16)}`;
}

export function randomSecret(): string {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

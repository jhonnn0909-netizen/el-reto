// Tipos compartidos con la API (ver CONTRACTS.md). Mantener sincronizados
// con los DTOs del backend.
export type Move = 'ROCK' | 'PAPER' | 'SCISSORS';
export type ChallengeFormat = 'BEST_OF_1' | 'BEST_OF_3' | 'BEST_OF_5' | 'FREE';
export type ChallengeVisibility = 'PUBLIC' | 'PRIVATE';
export type PresenceStatus =
  | 'LIBRE'
  | 'EN LÍNEA'
  | 'JUGANDO'
  | 'POR JUGAR'
  | 'RETO PENDIENTE'
  | 'RETO GENERADO'
  | 'POR INVITAR';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: 'USER' | 'ADMIN' | 'GUEST';
  status: string;
  emailVerifiedAt?: string | null;
  createdAt: string;
}

export interface WalletSummary {
  available: number;
  reserved: number;
  currency: 'CREDITO';
  /** Siempre true: la billetera es DEMO, sin valor real. */
  demo: true;
}

export interface WalletMovement {
  id: number;
  transactionId: string;
  type: string;
  status: string;
  description: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: number;
  balanceAfter: number;
  createdAt: string;
}

export interface Challenge {
  id: string;
  creatorId: string;
  creatorUsername?: string;
  title?: string | null;
  visibility: ChallengeVisibility;
  inviteCode?: string | null;
  format: ChallengeFormat;
  stakeCredits: number;
  status: 'OPEN' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';
  expiresAt: string;
  createdAt: string;
}

export interface Match {
  id: string;
  challengeId: string;
  player1Id: string;
  player2Id: string;
  player1Username?: string;
  player2Username?: string;
  format: ChallengeFormat;
  stakeCredits: number;
  status: 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
  currentRound: number;
  score1: number;
  score2: number;
  winnerId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface RankingEntry {
  userId: string;
  username: string;
  wins: number;
  losses: number;
  ties: number;
  matchesPlayed: number;
  points: number;
  position: number;
  /** Racha actual de victorias consecutivas. */
  currentStreak?: number;
  /** Mejor racha de victorias consecutivas. */
  bestStreak?: number;
  /** Nivel del jugador (cuando la API lo devuelve). */
  level?: number;
  /** Título del nivel (p. ej. «Retador»). */
  levelTitle?: string;
}

/** Juego de la plataforma (GET /games). */
export interface Game {
  id: string;
  slug: 'RPS' | 'CHECKERS' | 'CHINESE_CHECKERS' | 'CONNECT_FOUR' | string;
  name: string;
  description: string;
  /** 'PLAYABLE' o 'COMING_SOON'. */
  status: 'PLAYABLE' | 'COMING_SOON';
  /** Color de acento propio del juego (hex). */
  accentColor: string;
  players: number;
}

/** Reto del día (GET /challenges/daily). */
export interface DailyChallenge {
  id: string;
  challengeId: string;
  format: ChallengeFormat;
  stakeCredits: number;
  title: string;
  date: string;
}

/** Mensaje rápido dentro de una partida (WS match:message). */
export interface MatchMessage {
  id: string;
  matchId: string;
  playerId: string;
  playerName: string;
  text: string;
  createdAt: string;
}

export const QUICK_MESSAGES = [
  '¡Buena suerte!',
  '¡Buen juego!',
  '¡Otra vez!',
  '¡Qué buena jugada!',
  '¡Vamos!',
] as const;

export interface OnlinePerson {
  userId: string;
  username: string;
  status: PresenceStatus;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface SessionInfo {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  lastUsedAt?: string;
  current?: boolean;
}

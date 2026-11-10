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
  /**
   * Sentido para el usuario (lo calcula la API del efecto neto sobre
   * el saldo): CREDIT = entra dinero («+»), DEBIT = sale dinero («−»),
   * NEUTRAL = movimiento interno sin cambio de saldo (reserva de
   * apuesta). Antes la API no lo enviaba y el cliente lo leía como
   * undefined, así que todo se mostraba con «−».
   */
  direction: 'DEBIT' | 'CREDIT' | 'NEUTRAL';
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
  /** Partida creada al aceptar el reto (null mientras está abierto). */
  matchId?: string | null;
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
  /** Posición en el ranking; null si el usuario aún no tiene fila. */
  position: number | null;
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

/** Reto del día (GET /challenges/daily): es la vista estándar de reto
 * (la API devuelve toChallengeView con daily: true). Antes el tipo
 * pedía `challengeId` y `date`, campos que la API nunca devuelve:
 * `daily.challengeId` era undefined y aceptar el reto del día fallaba
 * siempre (400) con «No pudimos abrir el reto del día». */
export interface DailyChallenge {
  id: string;
  title?: string | null;
  format: ChallengeFormat;
  stakeCredits: number;
  status: 'OPEN' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';
  daily: boolean;
  matchId?: string | null;
  expiresAt: string;
  createdAt: string;
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
  /** La API de juego pagina con `items`; la de billetera/admin con `data`. */
  items?: T[];
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

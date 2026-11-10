export type Move = 'ROCK' | 'PAPER' | 'SCISSORS';
export const MOVES: readonly Move[] = ['ROCK', 'PAPER', 'SCISSORS'];

export type MatchFormat = 'BEST_OF_1' | 'BEST_OF_3' | 'BEST_OF_5' | 'FREE';
export const MATCH_FORMATS: readonly MatchFormat[] = [
  'BEST_OF_1',
  'BEST_OF_3',
  'BEST_OF_5',
  'FREE',
];

export type ChallengeVisibility = 'PUBLIC' | 'PRIVATE';
export type ChallengeStatus =
  | 'OPEN'
  | 'ACCEPTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'COMPLETED';
export type MatchStatus = 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';

export type RoundResult = 'PLAYER1' | 'PLAYER2' | 'TIE';

/** Estados de presencia (CONTRACTS.md §3.4). POR INVITAR lo gestiona el frontend. */
export type PresenceStatus =
  | 'JUGANDO'
  | 'RETO_PENDIENTE'
  | 'RETO_GENERADO'
  | 'POR_JUGAR'
  | 'LIBRE';

export type GameTypeStatus = 'PLAYABLE' | 'COMING_SOON';

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: 'USER' | 'ADMIN' | 'GUEST';
}

export interface ChallengeRow {
  id: string;
  creator_id: string;
  title: string | null;
  visibility: ChallengeVisibility;
  invite_code: string | null;
  format: MatchFormat;
  stake_credits: number;
  status: ChallengeStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface MatchRow {
  id: string;
  challenge_id: string;
  player1_id: string;
  player2_id: string;
  format: MatchFormat;
  game_type: string;
  stake_credits: number;
  status: MatchStatus;
  current_round: number;
  score1: number;
  score2: number;
  winner_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoundRow {
  id: string;
  match_id: string;
  round_number: number;
  player1_move: Move | null;
  player2_move: Move | null;
  player1_commit: string | null;
  player2_commit: string | null;
  result: RoundResult | null;
  started_at: string;
  resolved_at: string | null;
}

export interface MatchMoveRow {
  id: number;
  match_id: string;
  round_number: number;
  player_id: string;
  move: Move;
  commit_hash: string;
  revealed: boolean;
  created_at: string;
}

export interface RankingRow {
  user_id: string;
  username: string;
  display_name: string;
  wins: number;
  losses: number;
  ties: number;
  matches_played: number;
  points: number;
  current_streak: number;
  best_streak: number;
}

/**
 * Vista de ranking para el cliente (camelCase, como el resto de la
 * API). La fila de BD es snake_case (RankingRow) y nunca se expone
 * tal cual: antes se devolvía la fila cruda y el cliente leía
 * `matchesPlayed` / `currentStreak` / `bestStreak` / `position` como
 * undefined, así que el perfil mostraba «Partidas 0» aunque el
 * usuario tuviera victorias y derrotas.
 */
export interface RankingView {
  userId: string;
  username: string;
  displayName: string;
  wins: number;
  losses: number;
  ties: number;
  matchesPlayed: number;
  points: number;
  currentStreak: number;
  bestStreak: number;
  /** Posición en el ranking (1 = primero); null si aún no tiene fila. */
  position: number | null;
  level: number;
  levelTitle: string;
}

export interface GameTypeRow {
  code: string;
  name: string;
  description: string;
  min_players: number;
  max_players: number;
  status: GameTypeStatus;
  accent_color: string;
}

export interface LevelRow {
  level: number;
  min_points: number;
  title: string;
}

export interface PresenceEntry {
  userId: string;
  username: string;
  displayName: string;
  status: PresenceStatus;
  lastHeartbeat: string;
}

/** Evento interno del motor hacia el gateway (WebSocket). */
export interface GameEvent {
  name: string;
  payload: Record<string, unknown>;
}

// Operaciones de la API agrupadas por módulo (CONTRACTS.md §4).
// Todas usan `api` (fetch con Bearer + refresco automático).
import { api, clearTokens, setTokens } from './api';
import { clearStoredUser, setStoredUser } from './session';
import type {
  AppNotification,
  Challenge,
  ChallengeFormat,
  ChallengeVisibility,
  DailyChallenge,
  Game,
  Match,
  OnlinePerson,
  Paginated,
  RankingEntry,
  SessionInfo,
  User,
  WalletMovement,
  WalletSummary,
} from './types';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export function notifySessionChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('elreto:session'));
  }
}

function storeAuth(res: AuthResponse): AuthResponse {
  // Defensa: si la respuesta no trae tokens (p. ej. un registro que no
  // inicia sesión), no guardar "undefined" como texto en localStorage:
  // eso dejaba la sesión rota con "Tu sesión caducó" en la siguiente
  // petición. Mejor fallar aquí con un error visible.
  if (!res.accessToken || !res.refreshToken || !res.user) {
    throw new Error('La respuesta no incluye una sesión válida. Inténtalo de nuevo.');
  }
  setTokens(res.accessToken, res.refreshToken);
  setStoredUser(res.user);
  notifySessionChange();
  return res;
}

export const authApi = {
  register: (body: { username: string; email: string; password: string; displayName: string }) =>
    api.post<AuthResponse>('/auth/register', body).then(storeAuth),
  login: (body: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', body).then(storeAuth),
  guest: (displayName: string) =>
    api.post<AuthResponse>('/auth/guest', { displayName }).then(storeAuth),
  convertGuest: (body: { username: string; email: string; password: string }) =>
    api.post<AuthResponse>('/auth/convert-guest', body).then(storeAuth),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }),
  me: () => api.get<User>('/auth/me'),
  logout: async () => {
    try {
      // Quitar la presencia antes de borrar los tokens (la salida
      // exige sesión): si no, el usuario seguía en línea hasta 60 s.
      await gameApi.leavePresence().catch(() => undefined);
      await api.post('/auth/logout');
    } finally {
      clearTokens();
      clearStoredUser();
      notifySessionChange();
    }
  },
  checkUsername: (username: string) =>
    api.get<{ available: boolean }>(`/users/check-username/${encodeURIComponent(username)}`),
  sessions: () => api.get<SessionInfo[]>('/auth/sessions'),
  revokeSession: (id: string) => api.delete(`/auth/sessions/${id}`),
};

export const usersApi = {
  me: () => api.get<User & { wallet?: WalletSummary }>('/users/me'),
  updateMe: (body: { displayName?: string; bio?: string; country?: string }) =>
    api.patch<User>('/users/me', body),
  publicProfile: (username: string) => api.get<User>(`/users/${encodeURIComponent(username)}`),
};

export const walletApi = {
  summary: () => api.get<WalletSummary>('/wallet'),
  movements: (page = 1, limit = 20) =>
    api.get<Paginated<WalletMovement>>(`/wallet/movements?page=${page}&limit=${limit}`),
  deposit: (amount: number) =>
    api.post<{ available: number }>('/wallet/deposit', {
      amount,
      idempotencyKey: `dep-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }),
  withdraw: (amount: number) =>
    api.post<{ available: number }>('/wallet/withdraw', {
      amount,
      idempotencyKey: `wd-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }),
  promo: (code: string) => api.post('/wallet/promo', { code }),
};

export const gameApi = {
  createChallenge: (body: {
    title?: string;
    visibility: ChallengeVisibility;
    format: ChallengeFormat;
    stakeCredits: number;
  }) => api.post<Challenge>('/challenges', body),
  listChallenges: (params: { format?: string; mine?: boolean; page?: number; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.format) q.set('format', params.format);
    if (params.mine) q.set('mine', 'true');
    q.set('page', String(params.page ?? 1));
    q.set('limit', String(params.limit ?? 20));
    return api.get<Paginated<Challenge> | Challenge[]>(`/challenges?${q.toString()}`);
  },
  getChallenge: (id: string) => api.get<Challenge>(`/challenges/${id}`),
  getInvite: (code: string) => api.get<Challenge>(`/challenges/invite/${code}`),
  acceptChallenge: (id: string) => api.post<Match>(`/challenges/${id}/accept`),
  cancelChallenge: (id: string) => api.post(`/challenges/${id}/cancel`),
  getMatch: (id: string) => api.get<Match>(`/matches/${id}`),
  listMatches: (page = 1, limit = 20) =>
    api.get<Paginated<Match> | Match[]>(`/matches?page=${page}&limit=${limit}`),
  commit: (matchId: string, round: number, commitHash: string) =>
    api.post(`/matches/${matchId}/commit`, { round, commitHash }),
  reveal: (matchId: string, round: number, move: string, secret: string) =>
    api.post(`/matches/${matchId}/reveal`, { round, move, secret }),
  cancelMatch: (matchId: string) => api.post(`/matches/${matchId}/cancel`),
  ranking: (limit = 50) => api.get<RankingEntry[] | Paginated<RankingEntry>>(`/ranking?limit=${limit}`),
  rankingOf: (username: string) =>
    api.get<RankingEntry>(`/ranking/${encodeURIComponent(username)}`),
  presence: () => api.get<OnlinePerson[]>('/presence/online'),
  /** Latido de presencia (el panel en línea lo envía cada 20 s). */
  heartbeat: () => api.post<{ ok: boolean }>('/presence/heartbeat'),
  /** Salida de presencia (al cerrar sesión): quita al usuario de la lista en el acto. */
  leavePresence: () => api.post<{ ok: boolean }>('/presence/leave'),
  /** Catálogo de juegos de la plataforma (mejora: área de juegos). */
  games: () => api.get<Game[] | Paginated<Game>>('/games'),
  /** Reto del día (mejora: reto diario, premio 100 créditos DEMO). */
  dailyChallenge: () => api.get<DailyChallenge>('/challenges/daily'),
};

export const notificationsApi = {
  list: (page = 1, limit = 20) =>
    api.get<Paginated<AppNotification> | AppNotification[]>(`/notifications?page=${page}&limit=${limit}`),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const adminApi = {
  stats: () =>
    api.get<{ users: number; matches: number; challenges: number; creditsInCirculation: number }>('/admin/stats'),
  users: (page = 1, limit = 20) =>
    api.get<Paginated<User> | User[]>(`/admin/users?page=${page}&limit=${limit}`),
  matches: (page = 1, limit = 20) =>
    api.get<Paginated<Match> | Match[]>(`/admin/matches?page=${page}&limit=${limit}`),
  transactions: (page = 1, limit = 20) =>
    api.get<Paginated<WalletMovement> | WalletMovement[]>(`/admin/transactions?page=${page}&limit=${limit}`),
  audit: (page = 1, limit = 20) =>
    api.get<Paginated<Record<string, unknown>>>(`/admin/audit?page=${page}&limit=${limit}`),
  reconcile: () => api.get<{ ok: boolean; checked: number; mismatches: number }>('/admin/wallet/reconcile'),
};

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { DatabaseService } from '../../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.types';
import { GameEngineRegistry } from './game-engine.registry';
import {
  ChallengeRow,
  ChallengeStatus,
  GameEvent,
  GameTypeRow,
  LevelRow,
  MatchFormat,
  MatchMoveRow,
  MatchRow,
  Move,
  RankingRow,
  RankingView,
  RoundResult,
  RoundRow,
  UserRow,
} from './game.types';
import { PresenceService } from './presence.service';
import { WALLET_PORT, WalletPort } from './wallet-port';
import { computeCommitHash } from './game-engine.interface';
import { CreateChallengeDto } from './dto/create-challenge.dto';

/** Ejecutor SQL: sirve DatabaseService y el cliente de una transacción. */
type Executor = {
  query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
};

const MIN_STAKE_WITH_PRIZE = 10;
const DAILY_PRIZE_CREDITS = 100;
const SYSTEM_USERNAME = 'el-reto';
const DAILY_ADVISORY_LOCK_KEY = 20261110;

/** Mensajes rápidos permitidos en partida (lista cerrada, mejora 9). */
export const QUICK_MESSAGES: readonly string[] = [
  '¡Buena suerte!',
  '¡Buen juego!',
  '¡Otra vez!',
  '¡Qué buena jugada!',
  '¡Vamos!',
];

const DAILY_FORMATS: MatchFormat[] = ['BEST_OF_1', 'BEST_OF_3', 'BEST_OF_5'];

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

export function dailyFormatFor(date: Date): MatchFormat {
  return DAILY_FORMATS[dayOfYear(date) % DAILY_FORMATS.length];
}

export function dailyTitleFor(date: Date): string {
  return `Reto diario ${date.toISOString().slice(0, 10)}`;
}

/**
 * Motor de juego (retos, partidas RPS, ranking, reto diario).
 * Única autoridad sobre resultados y créditos: toda validación y toda
 * resolución ocurre aquí, en el backend. El gateway WebSocket delega
 * en este servicio y no duplica lógica.
 */
@Injectable()
export class GameService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  /** Eventos hacia el gateway WebSocket (match:state, round:result, ...). */
  readonly events = new EventEmitter();
  private timer: NodeJS.Timeout | null = null;
  private levelsCache: LevelRow[] | null = null;
  private systemUserIdCache: string | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly presence: PresenceService,
    private readonly engines: GameEngineRegistry,
    @Optional() @Inject(WALLET_PORT) private readonly wallet?: WalletPort,
  ) {}

  onModuleInit(): void {
    // Chequeo periódico del temporizador (sin @nestjs/schedule: no está
    // instalado). Revisa retos expirados y rondas sin revelar.
    this.timer = setInterval(() => {
      void this.checkTimeouts().catch((err) => {
        this.logger.error(`Error en el chequeo de temporizador: ${err}`);
      });
    }, 5000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------- Configuración ----------

  private get moveTimeoutSeconds(): number {
    return this.config.get<number>('game.moveTimeoutSeconds') ?? 30;
  }

  private get challengeTtlHours(): number {
    return this.config.get<number>('game.challengeTtlHours') ?? 24;
  }

  private get maxStake(): number {
    return this.config.get<number>('demo.maxStake') ?? 1000;
  }

  private requireWallet(): WalletPort {
    if (!this.wallet) {
      throw new ServiceUnavailableException('WALLET_NOT_CONFIGURED');
    }
    return this.wallet;
  }

  private emitAll(events: GameEvent[]): void {
    for (const e of events) this.events.emit(e.name, e.payload);
  }

  // ---------- Utilidades de datos ----------

  private async getUser(
    exec: Executor,
    userId: string,
  ): Promise<UserRow | null> {
    const res = await exec.query<UserRow>(
      'SELECT id, username, display_name, role FROM users WHERE id = $1',
      [userId],
    );
    return res.rows[0] ?? null;
  }

  private async getSystemUserId(): Promise<string | null> {
    if (this.systemUserIdCache) return this.systemUserIdCache;
    const res = await this.db.query<{ id: string }>(
      'SELECT id FROM users WHERE username = $1',
      [SYSTEM_USERNAME],
    );
    this.systemUserIdCache = res.rows[0]?.id ?? null;
    return this.systemUserIdCache;
  }

  private async loadLevels(): Promise<LevelRow[]> {
    if (this.levelsCache) return this.levelsCache;
    const res = await this.db.query<LevelRow>(
      'SELECT level, min_points, title FROM levels ORDER BY min_points ASC',
    );
    this.levelsCache =
      res.rows.length > 0
        ? res.rows
        : [{ level: 1, min_points: 0, title: 'Novato' }];
    return this.levelsCache;
  }

  private levelForPoints(points: number, levels: LevelRow[]): LevelRow {
    let best = levels[0];
    for (const l of levels) {
      if (points >= l.min_points) best = l;
    }
    return best;
  }

  private async notify(
    client: PoolClient,
    events: GameEvent[],
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const systemId = await this.getSystemUserId();
    if (systemId && userId === systemId) return; // al usuario de sistema no se le notifica
    const row = await this.notifications.create(
      { userId, type, title, body, data },
      client,
    );
    events.push({
      name: 'notification:new',
      payload: {
        userId,
        notification: {
          id: row.id,
          type: row.type,
          title: row.title,
          body: row.body,
          data: row.data ?? {},
          createdAt: row.created_at,
        },
      },
    });
  }

  private async logEvent(
    client: PoolClient,
    matchId: string,
    eventType: string,
    playerId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO match_events (match_id, event_type, player_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [matchId, eventType, playerId, JSON.stringify(payload)],
    );
  }

  // ---------- Retos ----------

  async createChallenge(user: AuthUser, dto: CreateChallengeDto) {
    const stake = dto.stakeCredits ?? 0;
    const dbUser = await this.getUser(this.db, user.id);
    if (!dbUser) throw new NotFoundException('USER_NOT_FOUND');
    if (stake > 0 && dbUser.role === 'GUEST') {
      throw new ForbiddenException('GUEST_STAKE_NOT_ALLOWED');
    }
    if (stake > this.maxStake) {
      throw new BadRequestException('STAKE_TOO_HIGH');
    }
    if (stake > 0 && stake < MIN_STAKE_WITH_PRIZE) {
      throw new BadRequestException('STAKE_TOO_LOW');
    }
    const visibility = dto.visibility ?? 'PUBLIC';
    const format = dto.format ?? 'BEST_OF_3';
    const expiresAt = new Date(
      Date.now() + this.challengeTtlHours * 3_600_000,
    ).toISOString();
    const inviteCode =
      visibility === 'PRIVATE'
        ? randomBytes(6).toString('base64url').replace(/[^A-Za-z0-9]/g, 'X')
        : null;

    const events: GameEvent[] = [];
    const challenge = await this.db.transaction(async (client) => {
      if (stake > 0) {
        await this.requireWallet().holdBet(client, {
          userId: user.id,
          amount: stake,
          referenceId: `challenge:${user.id}:${Date.now()}`,
        });
      }
      const res = await client.query<ChallengeRow>(
        `INSERT INTO challenges (creator_id, title, visibility, invite_code, format, stake_credits, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          user.id,
          dto.title ?? null,
          visibility,
          inviteCode,
          format,
          stake,
          expiresAt,
        ],
      );
      return res.rows[0];
    });
    events.push({
      name: 'challenge:created',
      payload: { challenge: toChallengeView(challenge, false) },
    });
    this.emitAll(events);
    return toChallengeView(challenge, false);
  }

  async listChallenges(
    user: AuthUser,
    opts: { format?: MatchFormat; mine?: boolean; page?: number; limit?: number },
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;
    let where: string;
    let params: unknown[];
    if (opts.mine) {
      where = 'creator_id = $1';
      params = [user.id];
    } else {
      where = `status = 'OPEN' AND (visibility = 'PUBLIC' OR creator_id = $1)`;
      params = [user.id];
    }
    if (opts.format) {
      where += ` AND format = $${params.length + 1}`;
      params.push(opts.format);
    }
    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM challenges WHERE ${where}`,
      params,
    );
    const rowsRes = await this.db.query<ChallengeRow>(
      `SELECT * FROM challenges WHERE ${where}
       ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const systemId = await this.getSystemUserId();
    return {
      items: rowsRes.rows.map((c) => toChallengeView(c, c.creator_id === systemId)),
      total: Number(totalRes.rows[0]?.count ?? 0),
      page,
      limit,
    };
  }

  async getChallenge(user: AuthUser, id: string) {
    const res = await this.db.query<ChallengeRow>(
      'SELECT * FROM challenges WHERE id = $1',
      [id],
    );
    const challenge = res.rows[0];
    if (!challenge) throw new NotFoundException('CHALLENGE_NOT_FOUND');
    // Reto privado: solo el creador lo ve por id (PRU-IDOR-01). El
    // invitado entra por el código (getChallengeByInviteCode).
    if (challenge.visibility === 'PRIVATE' && challenge.creator_id !== user.id) {
      throw new NotFoundException('CHALLENGE_NOT_FOUND');
    }
    const systemId = await this.getSystemUserId();
    const matchId = await this.findMatchIdForChallenge(challenge.id);
    return toChallengeView(challenge, challenge.creator_id === systemId, matchId);
  }

  async getChallengeByInviteCode(user: AuthUser, code: string) {
    void user;
    const res = await this.db.query<ChallengeRow>(
      'SELECT * FROM challenges WHERE invite_code = $1',
      [code],
    );
    const challenge = res.rows[0];
    if (!challenge) throw new NotFoundException('CHALLENGE_NOT_FOUND');
    const systemId = await this.getSystemUserId();
    const matchId = await this.findMatchIdForChallenge(challenge.id);
    return toChallengeView(challenge, challenge.creator_id === systemId, matchId);
  }

  /** Partida (la más reciente) creada al aceptar un reto, si la hay. */
  private async findMatchIdForChallenge(challengeId: string): Promise<string | null> {
    const res = await this.db.query<{ id: string }>(
      'SELECT id FROM matches WHERE challenge_id = $1 ORDER BY created_at DESC LIMIT 1',
      [challengeId],
    );
    return res.rows[0]?.id ?? null;
  }

  /**
   * Reto diario (mejora 9): determinista por fecha. El formato rota
   * BEST_OF_1/3/5 según el día del año; apuesta 0; premio 100 créditos
   * DEMO al ganador (WIN_PAYOUT desde PROMO, en el cierre). Se crea
   * perezosamente si no existe, con creador = usuario de sistema
   * 'el-reto'. Un solo reto por día (candado consultivo).
   */
  async getDailyChallenge(user: AuthUser) {
    const now = new Date();
    const title = dailyTitleFor(now);
    const format = dailyFormatFor(now);
    const endOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    ).toISOString();
    const systemId = await this.getSystemUserId();
    if (!systemId) {
      throw new ServiceUnavailableException('DAILY_SYSTEM_USER_MISSING');
    }
    const challenge = await this.db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [
        DAILY_ADVISORY_LOCK_KEY,
      ]);
      // Solo vale el reto de hoy si sigue ABIERTO: cuando una pareja
      // ya lo completó, el reto queda ACCEPTED/COMPLETED y un tercer
      // jugador se encontraba con CHALLENGE_NOT_OPEN al intentar
      // jugarlo (el reto del día «fallaba al abrir»). En ese caso se
      // crea uno nuevo para el mismo día, con el mismo título.
      const existing = await client.query<ChallengeRow>(
        "SELECT * FROM challenges WHERE creator_id = $1 AND title = $2 AND status = 'OPEN' ORDER BY created_at DESC LIMIT 1",
        [systemId, title],
      );
      if (existing.rows[0]) return existing.rows[0];
      const res = await client.query<ChallengeRow>(
        `INSERT INTO challenges (creator_id, title, visibility, format, stake_credits, expires_at)
         VALUES ($1, $2, 'PUBLIC', $3, 0, $4) RETURNING *`,
        [systemId, title, format, endOfDay],
      );
      return res.rows[0];
    });
    void user;
    return toChallengeView(challenge, true);
  }

  async acceptChallenge(user: AuthUser, challengeId: string) {
    const dbUser = await this.getUser(this.db, user.id);
    if (!dbUser) throw new NotFoundException('USER_NOT_FOUND');
    const systemId = await this.getSystemUserId();
    const events: GameEvent[] = [];
    const match = await this.db.transaction(async (client) => {
      const chRes = await client.query<ChallengeRow>(
        'SELECT * FROM challenges WHERE id = $1 FOR UPDATE',
        [challengeId],
      );
      const challenge = chRes.rows[0];
      if (!challenge) throw new NotFoundException('CHALLENGE_NOT_FOUND');
      if (challenge.status !== 'OPEN') {
        throw new BadRequestException('CHALLENGE_NOT_OPEN');
      }
      if (new Date(challenge.expires_at).getTime() < Date.now()) {
        await this.expireChallengeInTx(client, challenge);
        throw new BadRequestException('CHALLENGE_EXPIRED');
      }
      if (challenge.creator_id === user.id) {
        throw new ForbiddenException('CANNOT_ACCEPT_OWN_CHALLENGE');
      }
      if (challenge.stake_credits > 0 && dbUser.role === 'GUEST') {
        throw new ForbiddenException('GUEST_STAKE_NOT_ALLOWED');
      }
      const busyRes = await client.query<{ id: string }>(
        `SELECT id FROM matches WHERE (player1_id = $1 OR player2_id = $1)
         AND status IN ('WAITING', 'IN_PROGRESS') LIMIT 1`,
        [user.id],
      );
      if (busyRes.rows[0]) {
        throw new BadRequestException('ALREADY_IN_MATCH');
      }
      // Reto diario: el creador es el usuario de sistema, que nunca
      // juega. El primer aceptante ocupa el puesto de retador y el
      // reto sigue OPEN hasta que un segundo aceptante completa la
      // partida (player2 pasa del sistema al segundo jugador).
      const isDaily = !!systemId && challenge.creator_id === systemId;
      if (isDaily) {
        return this.acceptDailyInTx(client, challenge, user.id, systemId, events);
      }
      if (challenge.stake_credits > 0) {
        await this.requireWallet().holdBet(client, {
          userId: user.id,
          amount: challenge.stake_credits,
          referenceId: `challenge:${challenge.id}:${user.id}`,
        });
      }
      await client.query(
        `UPDATE challenges SET status = 'ACCEPTED', updated_at = now() WHERE id = $1`,
        [challenge.id],
      );
      const matchRes = await client.query<MatchRow>(
        `INSERT INTO matches (challenge_id, player1_id, player2_id, format, game_type, stake_credits, status)
         VALUES ($1, $2, $3, $4, 'RPS', $5, 'WAITING') RETURNING *`,
        [
          challenge.id,
          challenge.creator_id,
          user.id,
          challenge.format,
          challenge.stake_credits,
        ],
      );
      const created = matchRes.rows[0];
      await client.query(
        `INSERT INTO rounds (match_id, round_number) VALUES ($1, 1)`,
        [created.id],
      );
      await this.logEvent(client, created.id, 'MATCH_CREATED', null, {
        challengeId: challenge.id,
        format: challenge.format,
        stakeCredits: challenge.stake_credits,
      });
      await this.notify(
        client,
        events,
        challenge.creator_id,
        NotificationType.CHALLENGE_ACCEPTED,
        'Tu reto fue aceptado',
        'Un rival aceptó tu reto. ¡A jugar!',
        { challengeId: challenge.id, matchId: created.id },
      );
      return created;
    });
    events.push({
      name: 'match:state',
      payload: { matchId: match.id },
    });
    this.emitAll(events);
    return this.getMatchState(user.id, match.id);
  }

  /**
   * Aceptación del reto diario (ver acceptChallenge). Primera
   * aceptación: crea la partida en espera con el sistema como rival
   * provisional. Segunda: sustituye al sistema por el jugador real.
   */
  private async acceptDailyInTx(
    client: PoolClient,
    challenge: ChallengeRow,
    userId: string,
    systemId: string,
    events: GameEvent[],
  ): Promise<MatchRow> {
    const waitingRes = await client.query<MatchRow>(
      `SELECT * FROM matches WHERE challenge_id = $1 AND status = 'WAITING'`,
      [challenge.id],
    );
    const waiting = waitingRes.rows[0];
    if (waiting) {
      if (waiting.player2_id !== systemId) {
        throw new BadRequestException('CHALLENGE_NOT_OPEN');
      }
      if (waiting.player1_id === userId) {
        throw new BadRequestException('ALREADY_IN_MATCH');
      }
      await client.query(
        `UPDATE matches SET player2_id = $1, updated_at = now() WHERE id = $2`,
        [userId, waiting.id],
      );
      await client.query(
        `UPDATE challenges SET status = 'ACCEPTED', updated_at = now() WHERE id = $1`,
        [challenge.id],
      );
      await this.logEvent(client, waiting.id, 'MATCH_CREATED', null, {
        challengeId: challenge.id,
        format: challenge.format,
        stakeCredits: 0,
        daily: true,
      });
      await this.notify(
        client,
        events,
        waiting.player1_id,
        NotificationType.CHALLENGE_ACCEPTED,
        'Tu reto diario tiene rival',
        'Un rival se unió a tu reto diario. ¡A jugar!',
        { challengeId: challenge.id, matchId: waiting.id },
      );
      return { ...waiting, player2_id: userId };
    }
    const matchRes = await client.query<MatchRow>(
      `INSERT INTO matches (challenge_id, player1_id, player2_id, format, game_type, stake_credits, status)
       VALUES ($1, $2, $3, $4, 'RPS', 0, 'WAITING') RETURNING *`,
      [challenge.id, userId, systemId, challenge.format],
    );
    const created = matchRes.rows[0];
    await client.query(
      `INSERT INTO rounds (match_id, round_number) VALUES ($1, 1)`,
      [created.id],
    );
    await this.logEvent(client, created.id, 'MATCH_CREATED', null, {
      challengeId: challenge.id,
      format: challenge.format,
      stakeCredits: 0,
      daily: true,
      waitingOpponent: true,
    });
    return created;
  }

  async cancelChallenge(user: AuthUser, challengeId: string) {
    const events: GameEvent[] = [];
    const result = await this.db.transaction(async (client) => {
      const chRes = await client.query<ChallengeRow>(
        'SELECT * FROM challenges WHERE id = $1 FOR UPDATE',
        [challengeId],
      );
      const challenge = chRes.rows[0];
      if (!challenge) throw new NotFoundException('CHALLENGE_NOT_FOUND');
      if (challenge.creator_id !== user.id) {
        throw new ForbiddenException('NOT_CHALLENGE_CREATOR');
      }
      if (challenge.status !== 'OPEN') {
        throw new BadRequestException('CHALLENGE_NOT_OPEN');
      }
      if (challenge.stake_credits > 0) {
        await this.requireWallet().releaseBet(client, {
          userId: user.id,
          amount: challenge.stake_credits,
          referenceId: `challenge:${challenge.id}:${user.id}`,
        });
      }
      await client.query(
        `UPDATE challenges SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
        [challenge.id],
      );
      return { id: challenge.id, status: 'CANCELLED' as ChallengeStatus };
    });
    void events;
    return result;
  }

  private async expireChallengeInTx(
    client: PoolClient,
    challenge: ChallengeRow,
  ): Promise<void> {
    if (challenge.stake_credits > 0 && this.wallet) {
      try {
        await this.wallet.releaseBet(client, {
          userId: challenge.creator_id,
          amount: challenge.stake_credits,
          referenceId: `challenge:${challenge.id}:${challenge.creator_id}`,
        });
      } catch (err) {
        this.logger.error(`No se pudo liberar la reserva del reto expirado: ${err}`);
      }
    }
    await client.query(
      `UPDATE challenges SET status = 'EXPIRED', updated_at = now() WHERE id = $1`,
      [challenge.id],
    );
  }

  // ---------- Jugadas (commit-reveal) ----------

  async commitMove(
    user: AuthUser,
    matchId: string,
    round: number,
    commitHash: string,
  ) {
    if (!/^[0-9a-fA-F]{64}$/.test(commitHash)) {
      throw new BadRequestException('INVALID_COMMIT_HASH');
    }
    const events: GameEvent[] = [];
    await this.db.transaction(async (client) => {
      const match = await this.loadMatchForUpdate(client, matchId);
      this.assertPlayer(match, user.id);
      if (match.status !== 'WAITING' && match.status !== 'IN_PROGRESS') {
        throw new BadRequestException('MATCH_NOT_PLAYABLE');
      }
      // Reto diario en espera de rival real: el sistema no juega.
      const systemId = await this.getSystemUserId();
      if (
        systemId &&
        (match.player1_id === systemId || match.player2_id === systemId)
      ) {
        throw new BadRequestException('MATCH_WAITING_OPPONENT');
      }
      if (round !== match.current_round) {
        throw new BadRequestException('WRONG_ROUND');
      }
      const roundRow = await this.loadRound(client, matchId, round);
      if (!roundRow || roundRow.resolved_at) {
        throw new BadRequestException('ROUND_CLOSED');
      }
      const isP1 = match.player1_id === user.id;
      const commitCol = isP1 ? 'player1_commit' : 'player2_commit';
      const otherCommit = isP1 ? roundRow.player2_commit : roundRow.player1_commit;
      if (roundRow[commitCol]) {
        throw new BadRequestException('ALREADY_COMMITTED');
      }
      await client.query(
        `UPDATE rounds SET ${commitCol} = $1 WHERE id = $2`,
        [commitHash.toLowerCase(), roundRow.id],
      );
      if (match.status === 'WAITING') {
        await client.query(
          `UPDATE matches SET status = 'IN_PROGRESS', started_at = now(), updated_at = now() WHERE id = $1`,
          [match.id],
        );
      }
      await this.logEvent(client, match.id, 'COMMIT', user.id, { round });
      // Rival esperando: avisar al que aún no comprometió (una vez por ronda).
      if (!otherCommit) {
        const otherId = isP1 ? match.player2_id : match.player1_id;
        await this.notify(
          client,
          events,
          otherId,
          NotificationType.OPPONENT_WAITING,
          'Tu rival está esperando',
          'Tu rival ya eligió su jugada. ¡Te toca!',
          { matchId: match.id, round },
        );
      }
      events.push({
        name: 'match:committed',
        payload: { matchId: match.id, round, playerId: user.id },
      });
      events.push({ name: 'match:state', payload: { matchId: match.id } });
    });
    this.emitAll(events);
    return this.getMatchState(user.id, matchId);
  }

  async revealMove(
    user: AuthUser,
    matchId: string,
    round: number,
    move: Move,
    secret: string,
  ) {
    const events: GameEvent[] = [];
    let roundResult: {
      round: number;
      moves: { player1: Move | null; player2: Move | null };
      result: RoundResult;
      score: { player1: number; player2: number };
    } | null = null;
    await this.db.transaction(async (client) => {
      const match = await this.loadMatchForUpdate(client, matchId);
      this.assertPlayer(match, user.id);
      if (round !== match.current_round) {
        throw new BadRequestException('WRONG_ROUND');
      }
      const roundRow = await this.loadRound(client, matchId, round);
      if (!roundRow || roundRow.resolved_at) {
        throw new BadRequestException('ROUND_CLOSED');
      }
      const isP1 = match.player1_id === user.id;
      const commitCol = isP1 ? 'player1_commit' : 'player2_commit';
      const commit = roundRow[commitCol];
      if (!commit) {
        throw new BadRequestException('NO_COMMIT');
      }
      if (match.status !== 'IN_PROGRESS') {
        throw new BadRequestException('MATCH_NOT_PLAYABLE');
      }
      const existing = await client.query<MatchMoveRow>(
        `SELECT * FROM match_moves WHERE match_id = $1 AND round_number = $2 AND player_id = $3`,
        [matchId, round, user.id],
      );
      if (existing.rows[0]) {
        throw new BadRequestException('DUPLICATE_MOVE');
      }
      const engine = this.engines.get(match.game_type);
      if (!engine.isValidMove(move)) {
        throw new BadRequestException('INVALID_MOVE');
      }
      const expected = engine.computeCommitHash(move, secret);
      if (expected !== commit) {
        // Revelado incoherente (doc 07 §10.5): la jugada se rechaza y
        // cuenta como no jugada; el rival la gana si reveló, o el
        // temporizador resolverá la ronda. Se registra el intento.
        await client.query(
          `INSERT INTO match_moves (match_id, round_number, player_id, move, commit_hash, revealed)
           VALUES ($1, $2, $3, $4, $5, FALSE)`,
          [matchId, round, user.id, move, commit],
        );
        await this.logEvent(client, match.id, 'INVALID_REVEAL', user.id, {
          round,
        });
        throw new BadRequestException('INVALID_REVEAL');
      }
      await client.query(
        `INSERT INTO match_moves (match_id, round_number, player_id, move, commit_hash, revealed)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [matchId, round, user.id, move, commit],
      );
      await this.logEvent(client, match.id, 'REVEAL', user.id, { round });
      const both = await client.query<MatchMoveRow>(
        `SELECT * FROM match_moves WHERE match_id = $1 AND round_number = $2 AND revealed = TRUE`,
        [matchId, round],
      );
      if (both.rows.length === 2) {
        const m1 = both.rows.find((r) => r.player_id === match.player1_id)!;
        const m2 = both.rows.find((r) => r.player_id === match.player2_id)!;
        roundResult = await this.resolveRoundBothInTx(
          client,
          match,
          roundRow,
          m1.move,
          m2.move,
          events,
        );
      } else {
        events.push({ name: 'match:state', payload: { matchId: match.id } });
      }
    });
    this.emitAll(events);
    const state = await this.getMatchState(user.id, matchId);
    return { state, round: roundResult };
  }

  private async resolveRoundBothInTx(
    client: PoolClient,
    match: MatchRow,
    roundRow: RoundRow,
    move1: Move,
    move2: Move,
    events: GameEvent[],
  ) {
    const engine = this.engines.get(match.game_type);
    const result = engine.resolveRound(move1, move2);
    await client.query(
      `UPDATE rounds SET player1_move = $1, player2_move = $2, result = $3, resolved_at = now()
       WHERE id = $4`,
      [move1, move2, result, roundRow.id],
    );
    await this.logEvent(client, match.id, 'ROUND_RESOLVED', null, {
      round: roundRow.round_number,
      move1,
      move2,
      result,
    });
    const score1 = match.score1 + (result === 'PLAYER1' ? 1 : 0);
    const score2 = match.score2 + (result === 'PLAYER2' ? 1 : 0);
    const outcome = await this.advanceAfterRoundInTx(
      client,
      { ...match, score1, score2 },
      result,
      events,
    );
    void outcome;
    events.push({
      name: 'round:result',
      payload: {
        matchId: match.id,
        round: roundRow.round_number,
        moves: { player1: move1, player2: move2 },
        result,
        score: { player1: score1, player2: score2 },
      },
    });
    return {
      round: roundRow.round_number,
      moves: { player1: move1, player2: move2 },
      result,
      score: { player1: score1, player2: score2 },
    };
  }

  /**
   * Tras resolver una ronda: actualiza el marcador y decide si la
   * partida termina o avanza a la siguiente ronda.
   */
  private async advanceAfterRoundInTx(
    client: PoolClient,
    match: MatchRow,
    result: RoundResult,
    events: GameEvent[],
  ): Promise<{ finished: boolean }> {
    const engine = this.engines.get(match.game_type);
    const resolvedRes = await client.query<{ result: string | null }>(
      `SELECT result FROM rounds WHERE match_id = $1 AND resolved_at IS NOT NULL
       ORDER BY round_number DESC LIMIT $2`,
      [match.id, 5],
    );
    let consecutiveTies = 0;
    for (const r of resolvedRes.rows) {
      if (r.result === 'TIE') consecutiveTies++;
      else break;
    }
    const roundsPlayedRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rounds WHERE match_id = $1 AND resolved_at IS NOT NULL`,
      [match.id],
    );
    const fin = engine.isMatchFinished({
      format: match.format,
      score1: match.score1,
      score2: match.score2,
      roundsPlayed: Number(roundsPlayedRes.rows[0]?.count ?? 0),
      consecutiveTies,
    });
    await client.query(
      `UPDATE matches SET score1 = $1, score2 = $2, updated_at = now() WHERE id = $3`,
      [match.score1, match.score2, match.id],
    );
    if (fin.finished) {
      const winnerId = fin.draw
        ? null
        : fin.winner === 1
          ? match.player1_id
          : match.player2_id;
      await this.finishMatchInTx(
        client,
        { ...match },
        winnerId,
        fin.draw ? 'TIE_LIMIT' : 'SCORE',
        events,
      );
      return { finished: true };
    }
    const nextRound = match.current_round + 1;
    await client.query(
      `INSERT INTO rounds (match_id, round_number) VALUES ($1, $2)`,
      [match.id, nextRound],
    );
    await client.query(
      `UPDATE matches SET current_round = $1, updated_at = now() WHERE id = $2`,
      [nextRound, match.id],
    );
    events.push({ name: 'match:state', payload: { matchId: match.id } });
    return { finished: false };
  }

  private async finishMatchInTx(
    client: PoolClient,
    match: MatchRow,
    winnerId: string | null,
    reason: string,
    events: GameEvent[],
  ): Promise<void> {
    await client.query(
      `UPDATE matches SET status = 'FINISHED', winner_id = $1, finished_at = now(), updated_at = now()
       WHERE id = $2`,
      [winnerId, match.id],
    );
    await client.query(
      `UPDATE challenges SET status = 'COMPLETED', updated_at = now() WHERE id = $1`,
      [match.challenge_id],
    );
    const stake = match.stake_credits;
    let payout = 0;
    if (stake > 0) {
      const wallet = this.requireWallet();
      if (winnerId) {
        payout = stake * 2;
        await wallet.payoutWin(client, {
          winnerId,
          pot: payout,
          referenceId: `match:${match.id}`,
        });
      } else {
        await wallet.releaseBet(client, {
          userId: match.player1_id,
          amount: stake,
          referenceId: `match:${match.id}:${match.player1_id}`,
        });
        await wallet.releaseBet(client, {
          userId: match.player2_id,
          amount: stake,
          referenceId: `match:${match.id}:${match.player2_id}`,
        });
      }
    }
    // Ranking (solo usuarios registrados; misma transacción).
    const usersRes = await client.query<UserRow>(
      'SELECT id, username, display_name, role FROM users WHERE id = ANY($1)',
      [[match.player1_id, match.player2_id]],
    );
    const roleById = new Map(usersRes.rows.map((u) => [u.id, u.role]));
    const p1Registered = roleById.get(match.player1_id) !== 'GUEST';
    const p2Registered = roleById.get(match.player2_id) !== 'GUEST';
    if (winnerId) {
      const loserId =
        winnerId === match.player1_id ? match.player2_id : match.player1_id;
      if (roleById.get(winnerId) !== 'GUEST') {
        await this.updateRankingInTx(client, winnerId, 'WIN');
      }
      if (roleById.get(loserId) !== 'GUEST') {
        await this.updateRankingInTx(client, loserId, 'LOSS');
      }
    } else {
      if (p1Registered) await this.updateRankingInTx(client, match.player1_id, 'DRAW');
      if (p2Registered) await this.updateRankingInTx(client, match.player2_id, 'DRAW');
    }
    await this.logEvent(client, match.id, 'MATCH_FINISHED', winnerId, {
      winnerId,
      score1: match.score1,
      score2: match.score2,
      reason,
      payout,
    });
    // Premio del reto diario (mejora 9): 100 créditos DEMO desde PROMO.
    let dailyPrize = 0;
    const chRes = await client.query<ChallengeRow>(
      'SELECT * FROM challenges WHERE id = $1',
      [match.challenge_id],
    );
    const challenge = chRes.rows[0];
    const systemId = await this.getSystemUserId();
    const isDaily = !!challenge && !!systemId && challenge.creator_id === systemId;
    if (isDaily && winnerId) {
      if (roleById.get(winnerId) === 'GUEST') {
        await this.logEvent(client, match.id, 'DAILY_PRIZE_SKIPPED', winnerId, {
          reason: 'GUEST_HAS_NO_WALLET',
        });
      } else if (this.wallet) {
        await this.wallet.payoutDailyPrize(client, {
          winnerId,
          amount: DAILY_PRIZE_CREDITS,
          referenceId: `daily:${match.challenge_id}:${winnerId}`,
        });
        dailyPrize = DAILY_PRIZE_CREDITS;
      } else {
        await this.logEvent(client, match.id, 'DAILY_PRIZE_PENDING', winnerId, {
          reason: 'WALLET_NOT_CONFIGURED',
        });
      }
    }
    // Notificaciones de fin de partida.
    if (winnerId) {
      const loserId =
        winnerId === match.player1_id ? match.player2_id : match.player1_id;
      await this.notify(
        client,
        events,
        winnerId,
        NotificationType.MATCH_WON,
        '¡Ganaste la partida!',
        `Marcador final ${match.score1}-${match.score2}.`,
        { matchId: match.id },
      );
      if (payout > 0 || dailyPrize > 0) {
        await this.notify(
          client,
          events,
          winnerId,
          NotificationType.CREDITS_RECEIVED,
          'Créditos DEMO recibidos',
          `Recibiste ${payout + dailyPrize} créditos virtuales (demo).`,
          { matchId: match.id, amount: payout + dailyPrize },
        );
      }
      await this.notify(
        client,
        events,
        loserId,
        NotificationType.MATCH_FINISHED,
        'Partida terminada',
        'Tu rival ganó la partida.',
        { matchId: match.id },
      );
    } else {
      for (const pid of [match.player1_id, match.player2_id]) {
        await this.notify(
          client,
          events,
          pid,
          NotificationType.MATCH_FINISHED,
          'Partida terminada en empate',
          'La partida terminó en empate.',
          { matchId: match.id },
        );
      }
    }
    events.push({
      name: 'match:finished',
      payload: {
        matchId: match.id,
        winnerId,
        score: { player1: match.score1, player2: match.score2 },
        payout,
        dailyPrize,
        reason,
      },
    });
  }

  private async updateRankingInTx(
    client: PoolClient,
    userId: string,
    outcome: 'WIN' | 'LOSS' | 'DRAW',
  ): Promise<void> {
    // Puntos (doc 03 §17.1, provisional): victoria 3, empate 1, derrota 0.
    // Rachas (mejora 1): victoria +1 (y mejor = máx), derrota 0, empate sin cambio.
    if (outcome === 'WIN') {
      await client.query(
        `INSERT INTO rankings (user_id, wins, losses, ties, matches_played, points, current_streak, best_streak)
         VALUES ($1, 1, 0, 0, 1, 3, 1, 1)
         ON CONFLICT (user_id) DO UPDATE SET
           wins = rankings.wins + 1,
           matches_played = rankings.matches_played + 1,
           points = rankings.points + 3,
           current_streak = rankings.current_streak + 1,
           best_streak = GREATEST(rankings.best_streak, rankings.current_streak + 1),
           updated_at = now()`,
        [userId],
      );
    } else if (outcome === 'LOSS') {
      await client.query(
        `INSERT INTO rankings (user_id, wins, losses, ties, matches_played, points, current_streak, best_streak)
         VALUES ($1, 0, 1, 0, 1, 0, 0, 0)
         ON CONFLICT (user_id) DO UPDATE SET
           losses = rankings.losses + 1,
           matches_played = rankings.matches_played + 1,
           current_streak = 0,
           updated_at = now()`,
        [userId],
      );
    } else {
      await client.query(
        `INSERT INTO rankings (user_id, wins, losses, ties, matches_played, points, current_streak, best_streak)
         VALUES ($1, 0, 0, 1, 1, 1, 0, 0)
         ON CONFLICT (user_id) DO UPDATE SET
           ties = rankings.ties + 1,
           matches_played = rankings.matches_played + 1,
           points = rankings.points + 1,
           updated_at = now()`,
        [userId],
      );
    }
  }

  // ---------- Estado e historial ----------

  async assertMatchPlayer(userId: string, matchId: string): Promise<MatchRow> {
    const res = await this.db.query<MatchRow>(
      'SELECT * FROM matches WHERE id = $1',
      [matchId],
    );
    const match = res.rows[0];
    if (!match) throw new NotFoundException('MATCH_NOT_FOUND');
    this.assertPlayer(match, userId);
    return match;
  }

  private assertPlayer(match: MatchRow, userId: string): void {
    if (match.player1_id !== userId && match.player2_id !== userId) {
      throw new ForbiddenException('NOT_A_PLAYER');
    }
  }

  private async loadMatchForUpdate(
    client: PoolClient,
    matchId: string,
  ): Promise<MatchRow> {
    const res = await client.query<MatchRow>(
      'SELECT * FROM matches WHERE id = $1 FOR UPDATE',
      [matchId],
    );
    const match = res.rows[0];
    if (!match) throw new NotFoundException('MATCH_NOT_FOUND');
    return match;
  }

  private async loadRound(
    client: PoolClient,
    matchId: string,
    roundNumber: number,
  ): Promise<RoundRow | null> {
    const res = await client.query<RoundRow>(
      'SELECT * FROM rounds WHERE match_id = $1 AND round_number = $2',
      [matchId, roundNumber],
    );
    return res.rows[0] ?? null;
  }

  /**
   * Estado de la partida. Nunca revela la jugada del rival antes de
   * resolver la ronda: solo booleanos de commit/reveal y la propia
   * jugada del solicitante. Los espectadores ven el mismo estado sin
   * datos propios.
   */
  async getMatchState(userId: string, matchId: string) {
    const res = await this.db.query<MatchRow>(
      'SELECT * FROM matches WHERE id = $1',
      [matchId],
    );
    const match = res.rows[0];
    if (!match) throw new NotFoundException('MATCH_NOT_FOUND');
    const chRes = await this.db.query<ChallengeRow>(
      'SELECT * FROM challenges WHERE id = $1',
      [match.challenge_id],
    );
    const challenge = chRes.rows[0];
    const isPlayer =
      match.player1_id === userId || match.player2_id === userId;
    if (!isPlayer) {
      // Partida pública en curso: visible para cualquier autenticado
      // (mejora 8, modo espectador). Privada: exige invitación.
      if (!challenge || challenge.visibility === 'PRIVATE') {
        throw new NotFoundException('MATCH_NOT_FOUND');
      }
    }
    return this.buildMatchState(match, challenge, isPlayer ? userId : null);
  }

  /**
   * Estado público de la partida (vista de sala, sin perspectiva de
   * jugador): lo que el gateway difunde a la sala tras cada cambio.
   */
  async getRoomState(matchId: string) {
    const res = await this.db.query<MatchRow>(
      'SELECT * FROM matches WHERE id = $1',
      [matchId],
    );
    const match = res.rows[0];
    if (!match) throw new NotFoundException('MATCH_NOT_FOUND');
    const chRes = await this.db.query<ChallengeRow>(
      'SELECT * FROM challenges WHERE id = $1',
      [match.challenge_id],
    );
    return this.buildMatchState(match, chRes.rows[0], null);
  }

  private async buildMatchState(
    match: MatchRow,
    challenge: ChallengeRow | undefined,
    perspectiveUserId: string | null,
  ) {
    const usersRes = await this.db.query<UserRow>(
      'SELECT id, username, display_name, role FROM users WHERE id = ANY($1)',
      [[match.player1_id, match.player2_id]],
    );
    const byId = new Map(usersRes.rows.map((u) => [u.id, u]));
    const roundsRes = await this.db.query<RoundRow>(
      `SELECT * FROM rounds WHERE match_id = $1 ORDER BY round_number ASC`,
      [match.id],
    );
    const current = roundsRes.rows.find(
      (r) => r.round_number === match.current_round,
    );
    let myMove: Move | null = null;
    if (perspectiveUserId && current?.resolved_at === null) {
      const mineRes = await this.db.query<MatchMoveRow>(
        `SELECT * FROM match_moves WHERE match_id = $1 AND round_number = $2 AND player_id = $3`,
        [match.id, match.current_round, perspectiveUserId],
      );
      const mine = mineRes.rows[0];
      if (mine?.revealed) myMove = mine.move;
    }
    const spectators = await this.presence.listSpectators(match.id);
    const systemId = await this.getSystemUserId();
    const isP1 = perspectiveUserId === match.player1_id;
    const committed = current
      ? {
          player1: current.player1_commit !== null,
          player2: current.player2_commit !== null,
        }
      : { player1: false, player2: false };
    return {
      id: match.id,
      challengeId: match.challenge_id,
      format: match.format,
      gameType: match.game_type,
      stakeCredits: match.stake_credits,
      status: match.status,
      currentRound: match.current_round,
      score: { player1: match.score1, player2: match.score2 },
      // Campos planos que espera el cliente web (tipo Match): se derivan
      // de `players`/`score` para que la página de partida identifique a
      // los jugadores sin ambigüedad. Antes no existían y llegaban como
      // undefined, así que todo usuario con sesión se trataba como
      // espectador y la ronda nunca arrancaba.
      player1Id: match.player1_id,
      player2Id: match.player2_id,
      player1Username: byId.get(match.player1_id)?.username ?? '',
      player2Username: byId.get(match.player2_id)?.username ?? '',
      score1: match.score1,
      score2: match.score2,
      players: [match.player1_id, match.player2_id].map((id) => {
        const u = byId.get(id);
        // Rival provisional del reto diario: se muestra como espera.
        const waitingDaily =
          !!systemId &&
          id === systemId &&
          match.status === 'WAITING';
        return {
          id,
          username: u?.username ?? '',
          displayName: waitingDaily ? 'Esperando rival' : (u?.display_name ?? ''),
        };
      }),
      winnerId: match.winner_id,
      startedAt: match.started_at,
      finishedAt: match.finished_at,
      timeoutSeconds: this.moveTimeoutSeconds,
      isDaily: !!challenge && !!systemId && challenge.creator_id === systemId,
      asSpectator: perspectiveUserId === null,
      round: current
        ? {
            number: current.round_number,
            startedAt: current.started_at,
            committed:
              perspectiveUserId === null
                ? committed
                : {
                    me: isP1 ? committed.player1 : committed.player2,
                    opponent: isP1 ? committed.player2 : committed.player1,
                  },
            myMove,
          }
        : null,
      rounds: roundsRes.rows
        .filter((r) => r.resolved_at !== null)
        .map((r) => ({
          round: r.round_number,
          moves: { player1: r.player1_move, player2: r.player2_move },
          result: r.result,
          resolvedAt: r.resolved_at,
        })),
      spectators,
    };
  }

  async listMatches(
    user: AuthUser,
    opts: { page?: number; limit?: number; status?: string },
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;
    const where = opts.status
      ? `(m.player1_id = $1 OR m.player2_id = $1) AND m.status = $2`
      : `(m.player1_id = $1 OR m.player2_id = $1)`;
    const params: unknown[] = opts.status ? [user.id, opts.status] : [user.id];
    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM matches m WHERE ${where}`,
      params,
    );
    const rowsRes = await this.db.query<
      MatchRow & {
        opponent_username: string;
        opponent_display_name: string;
        player1_username: string;
        player2_username: string;
      }
    >(
      `SELECT m.*, opp.username AS opponent_username, opp.display_name AS opponent_display_name,
              p1.username AS player1_username, p2.username AS player2_username
       FROM matches m
       JOIN users opp ON opp.id = CASE WHEN m.player1_id = $1 THEN m.player2_id ELSE m.player1_id END
       JOIN users p1 ON p1.id = m.player1_id
       JOIN users p2 ON p2.id = m.player2_id
       WHERE ${where}
       ORDER BY m.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return {
      items: rowsRes.rows.map((m) => ({
        id: m.id,
        challengeId: m.challenge_id,
        format: m.format,
        gameType: m.game_type,
        stakeCredits: m.stake_credits,
        status: m.status,
        score: { player1: m.score1, player2: m.score2 },
        // Campos planos del tipo Match del cliente web (ver
        // buildMatchState): sin ellos el historial mostraba el marcador
        // como "undefined" y no identificaba al rival.
        player1Id: m.player1_id,
        player2Id: m.player2_id,
        player1Username: m.player1_username,
        player2Username: m.player2_username,
        score1: m.score1,
        score2: m.score2,
        winnerId: m.winner_id,
        opponent: {
          username: m.opponent_username,
          displayName: m.opponent_display_name,
        },
        result:
          m.status === 'FINISHED'
            ? m.winner_id === user.id
              ? 'WIN'
              : m.winner_id
                ? 'LOSS'
                : 'DRAW'
            : null,
        createdAt: m.created_at,
        finishedAt: m.finished_at,
      })),
      total: Number(totalRes.rows[0]?.count ?? 0),
      page,
      limit,
    };
  }

  async cancelMatch(user: AuthUser, matchId: string) {
    const events: GameEvent[] = [];
    await this.db.transaction(async (client) => {
      const match = await this.loadMatchForUpdate(client, matchId);
      this.assertPlayer(match, user.id);
      if (match.status === 'FINISHED' || match.status === 'CANCELLED') {
        throw new BadRequestException('MATCH_ALREADY_CLOSED');
      }
      if (match.status === 'WAITING') {
        // Antes de empezar: se cancela y se liberan las reservas.
        if (match.stake_credits > 0) {
          const wallet = this.requireWallet();
          await wallet.releaseBet(client, {
            userId: match.player1_id,
            amount: match.stake_credits,
            referenceId: `match:${match.id}:${match.player1_id}`,
          });
          await wallet.releaseBet(client, {
            userId: match.player2_id,
            amount: match.stake_credits,
            referenceId: `match:${match.id}:${match.player2_id}`,
          });
        }
        await client.query(
          `UPDATE matches SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
          [match.id],
        );
        // Reto diario: la cancelación reabre el reto para otro jugador.
        const cancelChRes = await client.query<ChallengeRow>(
          'SELECT * FROM challenges WHERE id = $1',
          [match.challenge_id],
        );
        const cancelSysId = await this.getSystemUserId();
        const cancelIsDaily =
          !!cancelChRes.rows[0] &&
          !!cancelSysId &&
          cancelChRes.rows[0].creator_id === cancelSysId;
        await client.query(
          `UPDATE challenges SET status = $1, updated_at = now() WHERE id = $2`,
          [cancelIsDaily ? 'OPEN' : 'CANCELLED', match.challenge_id],
        );
        await this.logEvent(client, match.id, 'MATCH_CANCELLED', user.id, {
          reason: 'CANCELLED_BEFORE_START',
        });
        const otherId =
          user.id === match.player1_id ? match.player2_id : match.player1_id;
        await this.notify(
          client,
          events,
          otherId,
          NotificationType.CHALLENGE_CANCELLED,
          'Partida cancelada',
          'Tu rival canceló la partida antes de empezar.',
          { matchId: match.id },
        );
        events.push({
          name: 'match:cancelled',
          payload: { matchId: match.id, reason: 'CANCELLED_BEFORE_START' },
        });
        return;
      }
      // En curso: abandonar es perder por abandono (doc 07 §14.2).
      const winnerId =
        user.id === match.player1_id ? match.player2_id : match.player1_id;
      await this.logEvent(client, match.id, 'FORFEIT', user.id, {
        winnerId,
      });
      await this.finishMatchInTx(client, match, winnerId, 'FORFEIT', events);
    });
    this.emitAll(events);
    return this.getMatchState(user.id, matchId);
  }

  /** Mensaje rápido (mejora 9): solo la lista cerrada, solo jugadores. */
  async saveQuickMessage(user: AuthUser, matchId: string, text: string) {
    if (!QUICK_MESSAGES.includes(text)) {
      throw new BadRequestException('QUICK_MESSAGE_NOT_ALLOWED');
    }
    const match = await this.assertMatchPlayer(user.id, matchId);
    if (match.status !== 'IN_PROGRESS' && match.status !== 'WAITING') {
      throw new BadRequestException('MATCH_NOT_PLAYABLE');
    }
    await this.db.query(
      `INSERT INTO match_events (match_id, event_type, player_id, payload)
       VALUES ($1, 'QUICK_MESSAGE', $2, $3)`,
      [matchId, user.id, JSON.stringify({ text })],
    );
    const dbUser = await this.getUser(this.db, user.id);
    return {
      matchId,
      playerId: user.id,
      displayName: dbUser?.display_name ?? user.displayName,
      text,
      at: new Date().toISOString(),
    };
  }

  // ---------- Ranking, juegos y niveles ----------

  async listGames(): Promise<GameTypeRow[]> {
    const res = await this.db.query<GameTypeRow>(
      `SELECT code, name, description, min_players, max_players, status, accent_color
       FROM game_types ORDER BY CASE code WHEN 'RPS' THEN 0 ELSE 1 END, name ASC`,
    );
    return res.rows;
  }

  async getRanking(limit = 20): Promise<RankingView[]> {
    const levels = await this.loadLevels();
    const res = await this.db.query<RankingRow & { rank: number }>(
      `SELECT r.*, u.username, u.display_name,
              ROW_NUMBER() OVER (ORDER BY r.points DESC, r.wins DESC) AS rank
       FROM rankings r JOIN users u ON u.id = r.user_id
       WHERE u.role <> 'GUEST'
       ORDER BY r.points DESC, r.wins DESC LIMIT $1`,
      [Math.min(100, Math.max(1, limit))],
    );
    return res.rows.map((r) => {
      const level = this.levelForPoints(r.points, levels);
      return {
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        matchesPlayed: r.matches_played,
        points: r.points,
        currentStreak: r.current_streak,
        bestStreak: r.best_streak,
        position: r.rank,
        level: level.level,
        levelTitle: level.title,
      };
    });
  }

  async getRankingByUsername(username: string) {
    const userRes = await this.db.query<UserRow>(
      'SELECT id, username, display_name, role FROM users WHERE lower(username) = lower($1)',
      [username],
    );
    const user = userRes.rows[0];
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const levels = await this.loadLevels();
    const rowRes = await this.db.query<RankingRow>(
      'SELECT * FROM rankings WHERE user_id = $1',
      [user.id],
    );
    const row = rowRes.rows[0];
    const stats = row ?? {
      user_id: user.id,
      username: user.username,
      display_name: user.display_name,
      wins: 0,
      losses: 0,
      ties: 0,
      matches_played: 0,
      points: 0,
      current_streak: 0,
      best_streak: 0,
    };
    let rank: number | null = null;
    if (row) {
      const rankRes = await this.db.query<{ rank: string }>(
        `SELECT COUNT(*)::text AS rank FROM rankings r
         WHERE r.points > $1 OR (r.points = $1 AND r.wins > $2)`,
        [row.points, row.wins],
      );
      rank = Number(rankRes.rows[0]?.rank ?? 0) + 1;
    }
    const level = this.levelForPoints(stats.points, levels);
    // La fila de `rankings` no trae username/display_name (son de
    // `users`): se toman del usuario ya cargado, no de la fila.
    return {
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      wins: stats.wins,
      losses: stats.losses,
      ties: stats.ties,
      matchesPlayed: stats.matches_played,
      points: stats.points,
      currentStreak: stats.current_streak,
      bestStreak: stats.best_streak,
      position: rank,
      level: level.level,
      levelTitle: level.title,
    };
  }

  // ---------- Temporizador ----------

  /**
   * Chequeo periódico (cada 5 s desde onModuleInit):
   * - retos OPEN expirados -> EXPIRED (libera la reserva del creador);
   * - rondas sin revelar tras MOVE_TIMEOUT_SECONDS:
   *   un revelado -> gana la ronda; ninguno -> ronda nula (se reinicia)
   *   o empate si se repite 3 veces; partida WAITING sin jugadas ->
   *   se cancela (doc 07 §11.4).
   */
  async checkTimeouts(): Promise<void> {
    const timeout = this.moveTimeoutSeconds;
    const expired = await this.db.query<ChallengeRow>(
      `UPDATE challenges SET status = 'EXPIRED', updated_at = now()
       WHERE status = 'OPEN' AND expires_at < now()
       RETURNING *`,
    );
    for (const challenge of expired.rows) {
      if (challenge.stake_credits > 0 && this.wallet) {
        try {
          await this.db.transaction(async (client) => {
            await this.wallet!.releaseBet(client, {
              userId: challenge.creator_id,
              amount: challenge.stake_credits,
              referenceId: `challenge:${challenge.id}:${challenge.creator_id}`,
            });
          });
        } catch (err) {
          this.logger.error(`No se pudo liberar la reserva expirada: ${err}`);
        }
      }
    }

    const rows = await this.db.query<
      MatchRow & {
        round_id: string;
        round_started_at: string;
        player1_commit: string | null;
        player2_commit: string | null;
      }
    >(
      `SELECT m.*, r.id AS round_id, r.started_at AS round_started_at,
              r.player1_commit, r.player2_commit
       FROM matches m
       JOIN rounds r ON r.match_id = m.id AND r.round_number = m.current_round
       WHERE m.status IN ('WAITING', 'IN_PROGRESS')
         AND r.resolved_at IS NULL
         AND r.started_at < now() - ($1 || ' seconds')::interval`,
      [String(timeout)],
    );
    for (const row of rows.rows) {
      const events: GameEvent[] = [];
      try {
        await this.db.transaction(async (client) => {
          const match = await this.loadMatchForUpdate(client, row.id);
          if (match.status !== 'WAITING' && match.status !== 'IN_PROGRESS') {
            return;
          }
          const roundRow = await this.loadRound(
            client,
            match.id,
            match.current_round,
          );
          if (!roundRow || roundRow.resolved_at) return;
          const revealed = await client.query<MatchMoveRow>(
            `SELECT * FROM match_moves WHERE match_id = $1 AND round_number = $2 AND revealed = TRUE`,
            [match.id, match.current_round],
          );
          if (revealed.rows.length === 1) {
            // Solo uno reveló: gana la ronda por tiempo.
            const winner = revealed.rows[0];
            const winnerIsP1 = winner.player_id === match.player1_id;
            const result: RoundResult = winnerIsP1 ? 'PLAYER1' : 'PLAYER2';
            await client.query(
              `UPDATE rounds SET player1_move = $1, player2_move = $2, result = $3, resolved_at = now()
               WHERE id = $4`,
              [
                winnerIsP1 ? winner.move : null,
                winnerIsP1 ? null : winner.move,
                result,
                roundRow.id,
              ],
            );
            await this.logEvent(client, match.id, 'ROUND_TIMEOUT', winner.player_id, {
              round: match.current_round,
              winnerId: winner.player_id,
            });
            const score1 = match.score1 + (result === 'PLAYER1' ? 1 : 0);
            const score2 = match.score2 + (result === 'PLAYER2' ? 1 : 0);
            events.push({
              name: 'round:result',
              payload: {
                matchId: match.id,
                round: match.current_round,
                moves: {
                  player1: winnerIsP1 ? winner.move : null,
                  player2: winnerIsP1 ? null : winner.move,
                },
                result,
                score: { player1: score1, player2: score2 },
                reason: 'TIMEOUT',
              },
            });
            await this.advanceAfterRoundInTx(
              client,
              { ...match, score1, score2 },
              result,
              events,
            );
            return;
          }
          if (revealed.rows.length === 0) {
            if (match.status === 'WAITING') {
              // El reto diario en espera de rival real no se cancela
              // por tiempo: espera hasta el fin del día.
              const dailyCh = await client.query<ChallengeRow>(
                'SELECT * FROM challenges WHERE id = $1',
                [match.challenge_id],
              );
              const sysId = await this.getSystemUserId();
              if (
                dailyCh.rows[0] &&
                sysId &&
                dailyCh.rows[0].creator_id === sysId
              ) {
                return;
              }
              // Nadie jugó antes de empezar: se cancela y se devuelve todo.
              if (match.stake_credits > 0 && this.wallet) {
                const wallet = this.wallet;
                await wallet.releaseBet(client, {
                  userId: match.player1_id,
                  amount: match.stake_credits,
                  referenceId: `match:${match.id}:${match.player1_id}`,
                });
                await wallet.releaseBet(client, {
                  userId: match.player2_id,
                  amount: match.stake_credits,
                  referenceId: `match:${match.id}:${match.player2_id}`,
                });
              }
              await client.query(
                `UPDATE matches SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
                [match.id],
              );
              await client.query(
                `UPDATE challenges SET status = 'CANCELLED', updated_at = now() WHERE id = $1`,
                [match.challenge_id],
              );
              await this.logEvent(client, match.id, 'MATCH_CANCELLED', null, {
                reason: 'NO_SHOW_TIMEOUT',
              });
              events.push({
                name: 'match:cancelled',
                payload: { matchId: match.id, reason: 'NO_SHOW_TIMEOUT' },
              });
              return;
            }
            // En curso y nadie reveló: ronda nula, se reinicia el reloj.
            await this.logEvent(client, match.id, 'ROUND_TIMEOUT_VOID', null, {
              round: match.current_round,
            });
            const voidRes = await client.query<{ count: string }>(
              `SELECT COUNT(*)::text AS count FROM match_events
               WHERE match_id = $1 AND event_type = 'ROUND_TIMEOUT_VOID'`,
              [match.id],
            );
            if (Number(voidRes.rows[0]?.count ?? 0) >= 3) {
              await this.finishMatchInTx(client, match, null, 'TIMEOUT_DRAW', events);
              return;
            }
            await client.query(
              `UPDATE rounds SET player1_commit = NULL, player2_commit = NULL, started_at = now()
               WHERE id = $1`,
              [roundRow.id],
            );
            await client.query(
              `DELETE FROM match_moves WHERE match_id = $1 AND round_number = $2`,
              [match.id, match.current_round],
            );
            events.push({
              name: 'match:state',
              payload: { matchId: match.id },
            });
          }
        });
      } catch (err) {
        this.logger.error(`Error resolviendo timeout de ${row.id}: ${err}`);
      }
      this.emitAll(events);
    }
  }
}

export function toChallengeView(
  challenge: ChallengeRow,
  isDaily: boolean,
  matchId?: string | null,
) {
  return {
    id: challenge.id,
    creatorId: challenge.creator_id,
    title: challenge.title,
    visibility: challenge.visibility,
    inviteCode: challenge.invite_code,
    format: challenge.format,
    stakeCredits: challenge.stake_credits,
    status: challenge.status,
    expiresAt: challenge.expires_at,
    createdAt: challenge.created_at,
    daily: isDaily,
    // Partida creada al aceptar el reto (null mientras está abierto):
    // la página del reto enlaza a ella cuando ya fue aceptado.
    matchId: matchId ?? null,
  };
}

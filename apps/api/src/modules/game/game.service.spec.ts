import { GameEngineRegistry } from './game-engine.registry';
import { computeCommitHash } from './game-engine.interface';
import {
  GameService,
  dailyFormatFor,
  dailyTitleFor,
} from './game.service';
import { RpsEngine } from './rps.engine';
import { AuthUser } from '../../common/auth/auth-user.interface';

/* ------------------------------------------------------------------ */
/* Base de datos falsa en memoria: responde al SQL que emite el        */
/* servicio con la misma semántica (sin Postgres/Redis reales).        */
/* ------------------------------------------------------------------ */

type Row = Record<string, any>;

class FakeDb {
  users: Row[] = [
    { id: 'u1', username: 'ana', display_name: 'Ana', role: 'USER' },
    { id: 'u2', username: 'bruno', display_name: 'Bruno', role: 'USER' },
    { id: 'u3', username: 'carla', display_name: 'Carla', role: 'USER' },
    { id: 'g1', username: 'invitado-abc', display_name: 'Invitado', role: 'GUEST' },
    { id: 'sys', username: 'el-reto', display_name: 'El Reto', role: 'USER' },
  ];
  challenges: Row[] = [];
  matches: Row[] = [];
  rounds: Row[] = [];
  moves: Row[] = [];
  events: Row[] = [];
  rankings: Row[] = [];
  levels: Row[] = [
    { level: 1, min_points: 0, title: 'Novato' },
    { level: 2, min_points: 100, title: 'Retador' },
    { level: 3, min_points: 250, title: 'Competidor' },
    { level: 4, min_points: 500, title: 'Experto' },
    { level: 5, min_points: 1000, title: 'Maestro' },
    { level: 6, min_points: 2000, title: 'Leyenda' },
  ];
  gameTypes: Row[] = [
    { code: 'RPS', name: 'Piedra, papel o tijera', description: 'Clásico', min_players: 2, max_players: 2, status: 'PLAYABLE', accent_color: '#22d3ee' },
    { code: 'DAMAS', name: 'Damas', description: 'Tablero', min_players: 2, max_players: 2, status: 'COMING_SOON', accent_color: '#a78bfa' },
    { code: 'DAMAS_CHINAS', name: 'Damas chinas', description: 'Triángulo', min_players: 2, max_players: 2, status: 'COMING_SOON', accent_color: '#f472b6' },
    { code: 'CONECTA_4', name: 'Conecta cuatro', description: 'Cuatro en línea', min_players: 2, max_players: 2, status: 'COMING_SOON', accent_color: '#facc15' },
  ];
  seq = 0;
  notifSeq = 0;

  query = jest.fn(async (sql: string, params: any[] = []) => this.route(sql, params));
  transaction = jest.fn(async (fn: (c: any) => Promise<any>) =>
    fn({ query: this.query }),
  );

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  route(sql: string, params: any[]): { rows: Row[]; rowCount?: number } {
    const ok = (rows: Row[], rowCount?: number) => ({ rows, rowCount: rowCount ?? rows.length });

    // Usuarios
    if (sql.includes('FROM users WHERE id = $1')) {
      return ok(this.users.filter((u) => u.id === params[0]));
    }
    if (sql.includes("FROM users WHERE username = $1")) {
      return ok(this.users.filter((u) => u.username === params[0]));
    }
    if (sql.includes('FROM users WHERE lower(username) = lower($1)')) {
      return ok(this.users.filter((u) => u.username.toLowerCase() === String(params[0]).toLowerCase()));
    }
    if (sql.includes('FROM users WHERE id = ANY($1)')) {
      return ok(this.users.filter((u) => (params[0] as string[]).includes(u.id)));
    }
    if (sql.includes('SELECT level, min_points, title FROM levels')) {
      return ok([...this.levels]);
    }
    if (sql.includes('SELECT code, name, description, min_players')) {
      return ok([...this.gameTypes]);
    }
    // Candado consultivo del reto diario
    if (sql.includes('pg_advisory_xact_lock')) return ok([]);
    // Eventos
    if (sql.includes("VALUES ($1, 'QUICK_MESSAGE'")) {
      this.events.push({ match_id: params[0], event_type: 'QUICK_MESSAGE', player_id: params[1], payload: JSON.parse(params[2]) });
      return ok([]);
    }
    if (sql.startsWith('INSERT INTO match_events')) {
      this.events.push({ match_id: params[0], event_type: params[1], player_id: params[2], payload: JSON.parse(params[3]) });
      return ok([]);
    }
    if (sql.includes("FROM match_events") && sql.includes("event_type = 'ROUND_TIMEOUT_VOID'")) {
      const n = this.events.filter((e) => e.match_id === params[0] && e.event_type === 'ROUND_TIMEOUT_VOID').length;
      return ok([{ count: String(n) }]);
    }
    // Retos
    if (sql.includes('INSERT INTO challenges')) {
      // Tres formas: crear reto (con invite_code), reto diario
      // (VALUES con 'PUBLIC' literal y apuesta 0 literal).
      const isDailyInsert = sql.includes("VALUES ($1, $2, 'PUBLIC', $3, 0, $4)");
      const row: Row = {
        id: this.id('ch'),
        creator_id: params[0],
        title: params[1],
        visibility: isDailyInsert ? 'PUBLIC' : params[2],
        invite_code: isDailyInsert ? null : params[3],
        format: isDailyInsert ? params[2] : params[4],
        stake_credits: isDailyInsert ? 0 : params[5],
        status: 'OPEN',
        expires_at: isDailyInsert ? params[3] : params[6],
        created_at: this.now(),
        updated_at: this.now(),
      };
      this.challenges.push(row);
      return ok([row]);
    }
    if (sql.includes('SELECT * FROM challenges WHERE creator_id = $1 AND title = $2')) {
      let list = this.challenges.filter((c) => c.creator_id === params[0] && c.title === params[1]);
      // El reto diario solo vale si sigue ABIERTO (el servicio filtra
      // status = 'OPEN'): un reto ya aceptado/completado no cuenta.
      if (sql.includes("status = 'OPEN'")) list = list.filter((c) => c.status === 'OPEN');
      return ok(list);
    }
    if (sql.includes('SELECT * FROM challenges WHERE invite_code = $1')) {
      return ok(this.challenges.filter((c) => c.invite_code === params[0]));
    }
    if (sql.includes('SELECT * FROM challenges WHERE id = $1')) {
      return ok(this.challenges.filter((c) => c.id === params[0]));
    }
    if (sql.includes("UPDATE challenges SET status = 'ACCEPTED'")) {
      const c = this.challenges.find((x) => x.id === params[0]);
      if (c) c.status = 'ACCEPTED';
      return ok([], 1);
    }
    if (sql.includes("UPDATE challenges SET status = 'CANCELLED'")) {
      const c = this.challenges.find((x) => x.id === params[0]);
      if (c) c.status = 'CANCELLED';
      return ok([], 1);
    }
    if (sql.includes("UPDATE challenges SET status = $1")) {
      const c = this.challenges.find((x) => x.id === params[1]);
      if (c) c.status = params[0];
      return ok([], 1);
    }
    if (sql.includes("UPDATE challenges SET status = 'EXPIRED'") && sql.includes('RETURNING *')) {
      const expired = this.challenges.filter((c) => c.status === 'OPEN' && new Date(c.expires_at).getTime() < Date.now());
      expired.forEach((c) => (c.status = 'EXPIRED'));
      return ok(expired);
    }
    if (sql.includes("UPDATE challenges SET status = 'EXPIRED'")) {
      const c = this.challenges.find((x) => x.id === params[0]);
      if (c) c.status = 'EXPIRED';
      return ok([], 1);
    }
    if (sql.includes("UPDATE challenges SET status = 'COMPLETED'")) {
      const c = this.challenges.find((x) => x.id === params[0]);
      if (c) c.status = 'COMPLETED';
      return ok([], 1);
    }
    if (sql.includes('SELECT COUNT(*)::text AS count FROM challenges')) {
      return ok([{ count: String(this.challenges.length) }]);
    }
    if (sql.includes('SELECT * FROM challenges WHERE')) {
      let list = this.challenges.filter(
        (c) => c.status === 'OPEN' && (c.visibility === 'PUBLIC' || c.creator_id === params[0]),
      );
      if (sql.includes('format = $')) list = list.filter((c) => c.format === params[1]);
      return ok(list);
    }
    // Partidas
    if (sql.includes('INSERT INTO matches (challenge_id')) {
      const row: Row = {
        id: this.id('m'),
        challenge_id: params[0],
        player1_id: params[1],
        player2_id: params[2],
        format: params[3],
        game_type: 'RPS',
        stake_credits: params[4],
        status: 'WAITING',
        current_round: 1,
        score1: 0,
        score2: 0,
        winner_id: null,
        started_at: null,
        finished_at: null,
        created_at: this.now(),
        updated_at: this.now(),
      };
      this.matches.push(row);
      return ok([row]);
    }
    if (sql.includes('SELECT * FROM matches WHERE challenge_id = $1')) {
      return ok(this.matches.filter((m) => m.challenge_id === params[0] && m.status === 'WAITING'));
    }
    if (sql.includes("UPDATE matches SET player2_id = $1")) {
      const m = this.matches.find((x) => x.id === params[1]);
      if (m) m.player2_id = params[0];
      return ok([], 1);
    }
    if (sql.includes("SELECT id FROM matches WHERE (player1_id")) {
      const busy = this.matches.find(
        (m) => (m.player1_id === params[0] || m.player2_id === params[0]) &&
          (m.status === 'WAITING' || m.status === 'IN_PROGRESS'),
      );
      return ok(busy ? [{ id: busy.id }] : []);
    }
    if (sql.includes('SELECT * FROM matches WHERE id = $1 FOR UPDATE')) {
      return ok(this.matches.filter((m) => m.id === params[0]));
    }
    if (sql.includes('SELECT * FROM matches WHERE id = $1')) {
      return ok(this.matches.filter((m) => m.id === params[0]));
    }
    if (sql.includes('r.started_at < now()')) {
      const timeoutSec = Number(params[0]);
      const out: Row[] = [];
      for (const m of this.matches) {
        if (m.status !== 'WAITING' && m.status !== 'IN_PROGRESS') continue;
        const r = this.rounds.find((x) => x.match_id === m.id && x.round_number === m.current_round && !x.resolved_at);
        if (r && new Date(r.started_at).getTime() < Date.now() - timeoutSec * 1000) {
          out.push({ ...m, round_id: r.id, round_started_at: r.started_at, player1_commit: r.player1_commit, player2_commit: r.player2_commit });
        }
      }
      return ok(out);
    }
    if (sql.includes("UPDATE matches SET status = 'IN_PROGRESS'")) {
      const m = this.matches.find((x) => x.id === params[0]);
      if (m) { m.status = 'IN_PROGRESS'; m.started_at = this.now(); }
      return ok([], 1);
    }
    if (sql.includes("UPDATE matches SET status = 'FINISHED'")) {
      // params: [winnerId, matchId]
      const m = this.matches.find((x) => x.id === params[1]);
      if (m) { m.status = 'FINISHED'; m.winner_id = params[0]; m.finished_at = this.now(); }
      return ok([], 1);
    }
    if (sql.includes("UPDATE matches SET status = 'CANCELLED'")) {
      const m = this.matches.find((x) => x.id === params[0]);
      if (m) m.status = 'CANCELLED';
      return ok([], 1);
    }
    if (sql.includes('UPDATE matches SET score1 = $1')) {
      const m = this.matches.find((x) => x.id === params[2]);
      if (m) { m.score1 = params[0]; m.score2 = params[1]; }
      return ok([], 1);
    }
    if (sql.includes('UPDATE matches SET current_round = $1')) {
      const m = this.matches.find((x) => x.id === params[1]);
      if (m) m.current_round = params[0];
      return ok([], 1);
    }
    if (sql.includes('SELECT COUNT(*)::text AS count FROM matches m WHERE')) {
      return ok([{ count: String(this.matches.length) }]);
    }
    if (sql.includes('SELECT id FROM matches WHERE challenge_id = $1')) {
      const found = this.matches
        .filter((m) => m.challenge_id === params[0])
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return ok(found.slice(0, 1).map((m) => ({ id: m.id })));
    }
    if (sql.includes('FROM matches m')) {
      const list = this.matches
        .filter((m) => m.player1_id === params[0] || m.player2_id === params[0])
        .map((m) => {
          const oppId = m.player1_id === params[0] ? m.player2_id : m.player1_id;
          const opp = this.users.find((u) => u.id === oppId);
          const p1 = this.users.find((u) => u.id === m.player1_id);
          const p2 = this.users.find((u) => u.id === m.player2_id);
          return {
            ...m,
            opponent_username: opp?.username ?? '',
            opponent_display_name: opp?.display_name ?? '',
            player1_username: p1?.username ?? '',
            player2_username: p2?.username ?? '',
          };
        });
      return ok(list);
    }
    // Rondas
    if (sql.includes('INSERT INTO rounds (match_id, round_number)')) {
      const row: Row = {
        id: this.id('r'),
        match_id: params[0],
        // La primera ronda se inserta con literal 1, no con parámetro.
        round_number: params[1] ?? 1,
        player1_move: null,
        player2_move: null,
        player1_commit: null,
        player2_commit: null,
        result: null,
        started_at: this.now(),
        resolved_at: null,
      };
      this.rounds.push(row);
      return ok([row]);
    }
    if (sql.includes('SELECT * FROM rounds WHERE match_id = $1 AND round_number = $2')) {
      return ok(this.rounds.filter((r) => r.match_id === params[0] && r.round_number === params[1]));
    }
    if (sql.includes('SELECT * FROM rounds WHERE match_id = $1 ORDER BY round_number ASC')) {
      return ok(this.rounds.filter((r) => r.match_id === params[0]).sort((a, b) => a.round_number - b.round_number));
    }
    if (sql.includes('UPDATE rounds SET player1_commit = $1')) {
      const r = this.rounds.find((x) => x.id === params[1]);
      if (r) r.player1_commit = params[0];
      return ok([], 1);
    }
    if (sql.includes('UPDATE rounds SET player2_commit = $1')) {
      const r = this.rounds.find((x) => x.id === params[1]);
      if (r) r.player2_commit = params[0];
      return ok([], 1);
    }
    if (sql.includes('UPDATE rounds SET player1_move = $1')) {
      const r = this.rounds.find((x) => x.id === params[3]);
      if (r) { r.player1_move = params[0]; r.player2_move = params[1]; r.result = params[2]; r.resolved_at = this.now(); }
      return ok([], 1);
    }
    if (sql.includes('UPDATE rounds SET player1_commit = NULL')) {
      const r = this.rounds.find((x) => x.id === params[0]);
      if (r) { r.player1_commit = null; r.player2_commit = null; r.started_at = this.now(); }
      return ok([], 1);
    }
    if (sql.includes('SELECT result FROM rounds WHERE match_id = $1')) {
      const resolved = this.rounds
        .filter((r) => r.match_id === params[0] && r.resolved_at)
        .sort((a, b) => b.round_number - a.round_number)
        .slice(0, params[1]);
      return ok(resolved.map((r) => ({ result: r.result })));
    }
    if (sql.includes('SELECT COUNT(*)::text AS count FROM rounds')) {
      const n = this.rounds.filter((r) => r.match_id === params[0] && r.resolved_at).length;
      return ok([{ count: String(n) }]);
    }
    // Jugadas
    if (sql.includes('INSERT INTO match_moves')) {
      const row: Row = {
        id: this.moves.length + 1,
        match_id: params[0],
        round_number: params[1],
        player_id: params[2],
        move: params[3],
        commit_hash: params[4],
        revealed: sql.includes(', TRUE)'),
        created_at: this.now(),
      };
      this.moves.push(row);
      return ok([row]);
    }
    if (sql.includes('FROM match_moves WHERE match_id = $1 AND round_number = $2 AND player_id = $3')) {
      return ok(this.moves.filter((m) => m.match_id === params[0] && m.round_number === params[1] && m.player_id === params[2]));
    }
    if (sql.includes('FROM match_moves WHERE match_id = $1 AND round_number = $2 AND revealed = TRUE')) {
      return ok(this.moves.filter((m) => m.match_id === params[0] && m.round_number === params[1] && m.revealed));
    }
    if (sql.startsWith('DELETE FROM match_moves')) {
      this.moves = this.moves.filter((m) => !(m.match_id === params[0] && m.round_number === params[1]));
      return ok([]);
    }
    // Ranking
    if (sql.includes('INSERT INTO rankings')) {
      const userId = params[0];
      let row = this.rankings.find((r) => r.user_id === userId);
      if (!row) {
        row = { user_id: userId, wins: 0, losses: 0, ties: 0, matches_played: 0, points: 0, current_streak: 0, best_streak: 0 };
        this.rankings.push(row);
      }
      if (sql.includes('wins = rankings.wins + 1')) {
        row.wins += 1; row.matches_played += 1; row.points += 3;
        row.current_streak += 1; row.best_streak = Math.max(row.best_streak, row.current_streak);
      } else if (sql.includes('losses = rankings.losses + 1')) {
        row.losses += 1; row.matches_played += 1; row.current_streak = 0;
      } else {
        row.ties += 1; row.matches_played += 1; row.points += 1;
      }
      return ok([], 1);
    }
    if (sql.includes('SELECT * FROM rankings WHERE user_id = $1')) {
      return ok(this.rankings.filter((r) => r.user_id === params[0]));
    }
    if (sql.includes('SELECT COUNT(*)::text AS rank FROM rankings r')) {
      const [points, wins] = params;
      const n = this.rankings.filter((r) => r.points > points || (r.points === points && r.wins > wins)).length;
      return ok([{ rank: String(n) }]);
    }
    if (sql.includes('FROM rankings r JOIN users u')) {
      const joined: Row[] = this.rankings
        .map((r) => {
          const u = this.users.find((x) => x.id === r.user_id)!;
          return { ...r, username: u.username, display_name: u.display_name, role: u.role };
        })
        .filter((r) => r.role !== 'GUEST')
        .sort((a: Row, b: Row) => b.points - a.points || b.wins - a.wins)
        .slice(0, params[0])
        .map((r, i) => ({ ...r, rank: i + 1 }));
      return ok(joined);
    }
    throw new Error(`SQL no soportado por la BD falsa: ${sql.slice(0, 120)}`);
  }
}

const ana: AuthUser = { id: 'u1', username: 'ana', displayName: 'Ana', role: 'USER' };
const bruno: AuthUser = { id: 'u2', username: 'bruno', displayName: 'Bruno', role: 'USER' };
const carla: AuthUser = { id: 'u3', username: 'carla', displayName: 'Carla', role: 'USER' };
const guest: AuthUser = { id: 'g1', username: 'invitado-abc', displayName: 'Invitado', role: 'GUEST' };

function setup() {
  const fake = new FakeDb();
  const wallet = {
    holdBet: jest.fn(async () => undefined),
    releaseBet: jest.fn(async () => undefined),
    payoutWin: jest.fn(async () => undefined),
    payoutDailyPrize: jest.fn(async () => undefined),
  };
  const notifications = {
    create: jest.fn(async (input: any) => ({
      id: `n-${++fake.notifSeq}`,
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      read_at: null,
      created_at: new Date().toISOString(),
    })),
  };
  const presence = {
    heartbeat: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    getOnline: jest.fn(async () => []),
    addSpectator: jest.fn(async () => undefined),
    removeSpectator: jest.fn(async () => undefined),
    listSpectators: jest.fn(async () => ({ count: 0, names: [] })),
  };
  const config = {
    get: jest.fn((key: string) =>
      ({ 'game.moveTimeoutSeconds': 30, 'game.challengeTtlHours': 24, 'demo.maxStake': 1000 })[key as string],
    ),
  };
  const service = new GameService(
    fake as never,
    config as never,
    notifications as never,
    presence as never,
    new GameEngineRegistry(new RpsEngine()),
    wallet as never,
  );
  return { fake, wallet, notifications, presence, service };
}

async function startMatch(
  service: GameService,
  creator: AuthUser = ana,
  acceptor: AuthUser = bruno,
  format: 'BEST_OF_1' | 'BEST_OF_3' | 'BEST_OF_5' | 'FREE' = 'BEST_OF_1',
  stake = 0,
) {
  const challenge = await service.createChallenge(creator, { format, stakeCredits: stake });
  const state = await service.acceptChallenge(acceptor, challenge.id);
  return { challenge, matchId: state.id as string };
}

async function playRound(
  service: GameService,
  matchId: string,
  round: number,
  p1: AuthUser,
  move1: 'ROCK' | 'PAPER' | 'SCISSORS',
  p2: AuthUser,
  move2: 'ROCK' | 'PAPER' | 'SCISSORS',
): Promise<{
  state: any;
  round: {
    round: number;
    moves: { player1: string | null; player2: string | null };
    result: string;
    score: { player1: number; player2: number };
  } | null;
}> {
  const s1 = `secreto-${p1.id}-${round}`;
  const s2 = `secreto-${p2.id}-${round}`;
  await service.commitMove(p1, matchId, round, computeCommitHash(move1, s1));
  await service.commitMove(p2, matchId, round, computeCommitHash(move2, s2));
  await service.revealMove(p1, matchId, round, move1, s1);
  return service.revealMove(p2, matchId, round, move2, s2);
}

describe('GameService', () => {
  it('crea un reto público sin apuesta y lo lista', async () => {
    const { service, wallet } = setup();
    const ch = await service.createChallenge(ana, { format: 'BEST_OF_3', stakeCredits: 0 });
    expect(ch.status).toBe('OPEN');
    expect(ch.format).toBe('BEST_OF_3');
    expect(wallet.holdBet).not.toHaveBeenCalled();
    const list = await service.listChallenges(bruno, {});
    expect(list.items).toHaveLength(1);
    expect(list.total).toBe(1);
  });

  it('crea un reto privado con código y con apuesta reservada', async () => {
    const { service, wallet } = setup();
    const ch = await service.createChallenge(ana, {
      visibility: 'PRIVATE',
      format: 'BEST_OF_1',
      stakeCredits: 100,
    });
    expect(ch.inviteCode).toBeTruthy();
    expect(wallet.holdBet).toHaveBeenCalledWith(expect.anything(), {
      userId: 'u1',
      amount: 100,
      referenceId: expect.stringContaining('challenge:'),
    });
    // El privado no se ve por id si no eres el creador.
    await expect(service.getChallenge(bruno, ch.id)).rejects.toThrow('CHALLENGE_NOT_FOUND');
    const byCode = await service.getChallengeByInviteCode(bruno, ch.inviteCode as string);
    expect(byCode.id).toBe(ch.id);
  });

  it('valida apuestas: invitado, máximo y mínimo', async () => {
    const { service } = setup();
    await expect(
      service.createChallenge(guest, { stakeCredits: 10 }),
    ).rejects.toThrow('GUEST_STAKE_NOT_ALLOWED');
    await expect(
      service.createChallenge(ana, { stakeCredits: 1500 }),
    ).rejects.toThrow('STAKE_TOO_HIGH');
    await expect(
      service.createChallenge(ana, { stakeCredits: 5 }),
    ).rejects.toThrow('STAKE_TOO_LOW');
    await expect(
      service.createChallenge(guest, { stakeCredits: 0 }),
    ).resolves.toBeDefined();
  });

  it('aceptar crea la partida y reserva la apuesta del retado; no se puede aceptar el propio reto', async () => {
    const { service, wallet } = setup();
    const ch = await service.createChallenge(ana, { format: 'BEST_OF_1', stakeCredits: 50 });
    await expect(service.acceptChallenge(ana, ch.id)).rejects.toThrow(
      'CANNOT_ACCEPT_OWN_CHALLENGE',
    );
    const state = await service.acceptChallenge(bruno, ch.id);
    expect(state.status).toBe('WAITING');
    expect(state.players.map((p: any) => p.id)).toEqual(['u1', 'u2']);
    expect(wallet.holdBet).toHaveBeenCalledTimes(2);
    await expect(service.acceptChallenge(carla, ch.id)).rejects.toThrow(
      'CHALLENGE_NOT_OPEN',
    );
  });

  it('invitado con apuesta > 0 no puede aceptar', async () => {
    const { service } = setup();
    const ch = await service.createChallenge(ana, { format: 'BEST_OF_1', stakeCredits: 10 });
    await expect(service.acceptChallenge(guest, ch.id)).rejects.toThrow(
      'GUEST_STAKE_NOT_ALLOWED',
    );
  });

  it('flujo completo: ganador, liquidación y ranking con rachas', async () => {
    const { fake, service, wallet } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 100);
    const out = await playRound(service, matchId, 1, ana, 'ROCK', bruno, 'SCISSORS');
    expect(out.round?.result).toBe('PLAYER1');
    expect(out.state.status).toBe('FINISHED');
    expect(out.state.winnerId).toBe('u1');
    expect(wallet.payoutWin).toHaveBeenCalledWith(expect.anything(), {
      winnerId: 'u1',
      pot: 200,
      referenceId: `match:${matchId}`,
    });
    const ranking = await service.getRanking(10);
    expect(ranking).toHaveLength(2);
    const anaRow = ranking.find((r) => r.userId === 'u1')!;
    expect(anaRow.wins).toBe(1);
    expect(anaRow.points).toBe(3);
    expect(anaRow.matchesPlayed).toBe(1);
    expect(anaRow.currentStreak).toBe(1);
    expect(anaRow.bestStreak).toBe(1);
    expect(anaRow.position).toBe(1);
    expect(anaRow.level).toBe(1);
    expect(anaRow.levelTitle).toBe('Novato');
    const brunoRow = ranking.find((r) => r.userId === 'u2')!;
    expect(brunoRow.losses).toBe(1);
    expect(brunoRow.matchesPlayed).toBe(1);
    expect(brunoRow.currentStreak).toBe(0);
    expect(fake.matches[0].status).toBe('FINISHED');
  });

  it('empate repite la ronda sin sumar punto', async () => {
    const { service } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_3', 0);
    const out = await playRound(service, matchId, 1, ana, 'ROCK', bruno, 'ROCK');
    expect(out.round?.result).toBe('TIE');
    expect(out.state.status).toBe('IN_PROGRESS');
    expect(out.state.currentRound).toBe(2);
    expect(out.state.score).toEqual({ player1: 0, player2: 0 });
    const out2 = await playRound(service, matchId, 2, ana, 'PAPER', bruno, 'ROCK');
    expect(out2.round?.result).toBe('PLAYER1');
    expect(out2.state.score).toEqual({ player1: 1, player2: 0 });
  });

  it('commit-reveal: hash inválido, doble jugada y doble commit rechazados', async () => {
    const { service } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
    await service.commitMove(ana, matchId, 1, computeCommitHash('ROCK', 's1'));
    await expect(
      service.commitMove(ana, matchId, 1, computeCommitHash('PAPER', 's2')),
    ).rejects.toThrow('ALREADY_COMMITTED');
    await service.commitMove(bruno, matchId, 1, computeCommitHash('SCISSORS', 's2'));
    await expect(
      service.revealMove(ana, matchId, 1, 'PAPER', 's1'),
    ).rejects.toThrow('INVALID_REVEAL');
    await expect(
      service.revealMove(bruno, matchId, 1, 'SCISSORS', 's2'),
    ).resolves.toBeDefined();
    // Ana ya tiene jugada registrada (inválida): no puede reintentar.
    await expect(
      service.revealMove(ana, matchId, 1, 'ROCK', 's1'),
    ).rejects.toThrow('DUPLICATE_MOVE');
  });

  it('revelar sin commit y jugar fuera de ronda se rechazan', async () => {
    const { service } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
    await expect(service.revealMove(ana, matchId, 1, 'ROCK', 's')).rejects.toThrow('NO_COMMIT');
    await expect(
      service.commitMove(ana, matchId, 2, computeCommitHash('ROCK', 's')),
    ).rejects.toThrow('WRONG_ROUND');
    await expect(service.commitMove(carla, matchId, 1, computeCommitHash('ROCK', 's'))).rejects.toThrow(
      'NOT_A_PLAYER',
    );
  });

  it('el estado no revela la jugada del rival antes de resolver', async () => {
    const { service } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
    await service.commitMove(ana, matchId, 1, computeCommitHash('ROCK', 'sa'));
    await service.commitMove(bruno, matchId, 1, computeCommitHash('PAPER', 'sb'));
    await service.revealMove(ana, matchId, 1, 'ROCK', 'sa');
    const brunoState = await service.getMatchState('u2', matchId);
    expect(JSON.stringify(brunoState)).not.toContain('ROCK');
    expect(brunoState.rounds).toHaveLength(0);
    expect((brunoState.round as any).myMove).toBeNull();
    const room = await service.getRoomState(matchId);
    expect(JSON.stringify(room)).not.toContain('ROCK');
    expect(JSON.stringify(room)).not.toContain('PAPER');
    // Campos planos del tipo Match del cliente web: la página de
    // partida los usa para decidir jugador vs espectador.
    expect((brunoState as any).player1Id).toBe('u1');
    expect((brunoState as any).player2Id).toBe('u2');
    expect((brunoState as any).player1Username).toBe('ana');
    expect((brunoState as any).player2Username).toBe('bruno');
    expect((brunoState as any).score1).toBe(0);
    expect((brunoState as any).score2).toBe(0);
  });

  it('cancelar antes de empezar libera las reservas', async () => {
    const { service, wallet } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 100);
    await service.cancelMatch(bruno, matchId);
    expect(wallet.releaseBet).toHaveBeenCalledTimes(2);
    const state = await service.getMatchState('u1', matchId);
    expect(state.status).toBe('CANCELLED');
  });

  it('cancelar el reto libera la reserva del creador', async () => {
    const { service, wallet } = setup();
    const ch = await service.createChallenge(ana, { stakeCredits: 40 });
    await service.cancelChallenge(ana, ch.id);
    expect(wallet.releaseBet).toHaveBeenCalledWith(expect.anything(), {
      userId: 'u1',
      amount: 40,
      referenceId: expect.stringContaining('challenge:'),
    });
    await expect(service.cancelChallenge(bruno, ch.id)).rejects.toThrow(
      'NOT_CHALLENGE_CREATOR',
    );
  });

  it('abandonar en curso es perder por abandono: el rival gana y cobra', async () => {
    const { service, wallet } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_3', 50);
    await service.commitMove(ana, matchId, 1, computeCommitHash('ROCK', 'sa'));
    await service.commitMove(bruno, matchId, 1, computeCommitHash('PAPER', 'sb'));
    await service.cancelMatch(ana, matchId);
    const state = await service.getMatchState('u2', matchId);
    expect(state.status).toBe('FINISHED');
    expect(state.winnerId).toBe('u2');
    expect(wallet.payoutWin).toHaveBeenCalledWith(expect.anything(), {
      winnerId: 'u2',
      pot: 100,
      referenceId: `match:${matchId}`,
    });
  });

  it('temporizador: si uno revela y el otro no, gana el que reveló', async () => {
    const { fake, service } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
    await service.commitMove(ana, matchId, 1, computeCommitHash('ROCK', 'sa'));
    await service.commitMove(bruno, matchId, 1, computeCommitHash('SCISSORS', 'sb'));
    await service.revealMove(ana, matchId, 1, 'ROCK', 'sa');
    // Envejecer la ronda 60 s.
    fake.rounds[0].started_at = new Date(Date.now() - 60_000).toISOString();
    await service.checkTimeouts();
    const state = await service.getMatchState('u1', matchId);
    expect(state.status).toBe('FINISHED');
    expect(state.winnerId).toBe('u1');
  });

  it('temporizador: partida en espera sin jugadas se cancela', async () => {
    const { fake, service } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
    fake.rounds[0].started_at = new Date(Date.now() - 60_000).toISOString();
    await service.checkTimeouts();
    const state = await service.getMatchState('u1', matchId);
    expect(state.status).toBe('CANCELLED');
  });

  it('temporizador: ronda sin revelados se reinicia (nula)', async () => {
    const { fake, service } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_3', 0);
    await service.commitMove(ana, matchId, 1, computeCommitHash('ROCK', 'sa'));
    await service.commitMove(bruno, matchId, 1, computeCommitHash('PAPER', 'sb'));
    fake.rounds[0].started_at = new Date(Date.now() - 60_000).toISOString();
    await service.checkTimeouts();
    const state = await service.getMatchState('u1', matchId);
    expect(state.status).toBe('IN_PROGRESS');
    expect(state.currentRound).toBe(1);
    expect((state.round as any).committed).toEqual({ me: false, opponent: false });
  });

  it('rachas: dos victorias seguidas, derrota a cero, empate sin cambio', async () => {
    const { service } = setup();
    // Ana gana 2 seguidas.
    for (let i = 0; i < 2; i++) {
      const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
      await playRound(service, matchId, 1, ana, 'ROCK', bruno, 'SCISSORS');
    }
    let ranking = await service.getRanking(10);
    let anaRow = ranking.find((r) => r.userId === 'u1')!;
    expect(anaRow.currentStreak).toBe(2);
    expect(anaRow.bestStreak).toBe(2);
    // Ana pierde: racha a 0, mejor se mantiene.
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
    await playRound(service, matchId, 1, ana, 'SCISSORS', bruno, 'ROCK');
    ranking = await service.getRanking(10);
    anaRow = ranking.find((r) => r.userId === 'u1')!;
    expect(anaRow.currentStreak).toBe(0);
    expect(anaRow.bestStreak).toBe(2);
    // Empate final por 5 empates seguidos: la racha no cambia.
    const { matchId: tieId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
    for (let r = 1; r <= 5; r++) {
      await playRound(service, tieId, r, ana, 'ROCK', bruno, 'ROCK');
    }
    ranking = await service.getRanking(10);
    anaRow = ranking.find((r) => r.userId === 'u1')!;
    expect(anaRow.ties).toBe(1);
    expect(anaRow.points).toBe(7); // 3+3+0+1
    expect(anaRow.matchesPlayed).toBe(4);
    expect(anaRow.currentStreak).toBe(0); // seguía en 0 tras la derrota
    expect(anaRow.bestStreak).toBe(2);
  });

  it('el invitado no entra en el ranking', async () => {
    const { service } = setup();
    const { matchId } = await startMatch(service, ana, guest, 'BEST_OF_1', 0);
    await playRound(service, matchId, 1, ana, 'SCISSORS', guest, 'ROCK');
    const ranking = await service.getRanking(10);
    expect(ranking.find((r) => r.userId === 'g1')).toBeUndefined();
    expect(ranking.find((r) => r.userId === 'u2')).toBeUndefined();
    expect(ranking).toHaveLength(1); // solo Ana (derrota)
    expect(ranking[0].losses).toBe(1);
  });

  it('ranking por usuario con nivel según puntos', async () => {
    const { fake, service } = setup();
    fake.rankings.push({
      user_id: 'u1', wins: 30, losses: 5, ties: 10, matches_played: 45,
      points: 100, current_streak: 4, best_streak: 7,
    });
    const row = await service.getRankingByUsername('ANA');
    expect(row.points).toBe(100);
    expect(row.level).toBe(2);
    expect(row.levelTitle).toBe('Retador');
    expect(row.matchesPlayed).toBe(45);
    expect(row.currentStreak).toBe(4);
    expect(row.bestStreak).toBe(7);
    expect(row.position).toBe(1);
    expect(row.username).toBe('ana');
    await expect(service.getRankingByUsername('nadie')).rejects.toThrow('USER_NOT_FOUND');
  });

  it('GET /games: 4 juegos, solo RPS jugable', async () => {
    const { service } = setup();
    const games = await service.listGames();
    expect(games).toHaveLength(4);
    expect(games[0]).toMatchObject({ code: 'RPS', status: 'PLAYABLE' });
    expect(games.slice(1).map((g) => g.code).sort()).toEqual([
      'CONECTA_4',
      'DAMAS',
      'DAMAS_CHINAS',
    ]);
    expect(games.slice(1).every((g) => g.status === 'COMING_SOON')).toBe(true);
  });

  it('reto diario: determinista por fecha y mismo día = mismo reto', async () => {
    const { service } = setup();
    const first = await service.getDailyChallenge(ana);
    const second = await service.getDailyChallenge(bruno);
    expect(first.id).toBe(second.id);
    expect(first.daily).toBe(true);
    expect(first.title).toBe(dailyTitleFor(new Date()));
    expect(first.format).toBe(dailyFormatFor(new Date()));
    expect(first.stakeCredits).toBe(0);
  });

  it('reto diario: si el reto de hoy ya se cerró, se crea uno nuevo abierto', async () => {
    const { fake, service } = setup();
    const first = await service.getDailyChallenge(ana);
    // Una pareja ya lo jugó y el reto quedó ACCEPTED: un tercer
    // jugador debe poder abrir el reto del día, no encontrarse con
    // CHALLENGE_NOT_OPEN.
    fake.challenges[0].status = 'ACCEPTED';
    const third = await service.getDailyChallenge(carla);
    expect(third.id).not.toBe(first.id);
    expect(third.status).toBe('OPEN');
    expect(third.daily).toBe(true);
    expect(third.title).toBe(dailyTitleFor(new Date()));
    expect(third.stakeCredits).toBe(0);
  });

  it('reto diario: dos aceptantes juegan y el ganador cobra el premio PROMO', async () => {
    const { service, wallet } = setup();
    const daily = await service.getDailyChallenge(ana);
    // Primera aceptación: Ana queda como retadora, en espera de rival.
    const waiting = await service.acceptChallenge(ana, daily.id);
    expect((waiting.players[1] as any).displayName).toBe('Esperando rival');
    // Ana no puede jugar hasta que llegue el rival.
    await expect(
      service.commitMove(ana, waiting.id as string, 1, computeCommitHash('ROCK', 's')),
    ).rejects.toThrow('MATCH_WAITING_OPPONENT');
    // Segunda aceptación: Bruno completa la partida.
    const state = await service.acceptChallenge(bruno, daily.id);
    expect(state.players.map((p: any) => p.id)).toEqual(['u1', 'u2']);
    // Ana gana todas las rondas hasta cerrar la partida (el formato del
    // día puede ser BEST_OF_1/3/5: se juega hasta FINISHED).
    let out: any = null;
    for (let round = 1; round <= 5; round++) {
      out = await playRound(
        service,
        state.id as string,
        round,
        ana,
        'ROCK',
        bruno,
        'SCISSORS',
      );
      if (out.state.status === 'FINISHED') break;
    }
    expect(out.state.status).toBe('FINISHED');
    expect(out.state.winnerId).toBe('u1');
    expect(wallet.payoutDailyPrize).toHaveBeenCalledWith(expect.anything(), {
      winnerId: 'u1',
      amount: 100,
      referenceId: expect.stringContaining('daily:'),
    });
  });

  it('mensajes rápidos: permitido y no permitido; solo jugadores', async () => {
    const { service } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
    const msg = await service.saveQuickMessage(ana, matchId, '¡Buena suerte!');
    expect(msg.text).toBe('¡Buena suerte!');
    await expect(
      service.saveQuickMessage(ana, matchId, 'hola, nos vemos luego'),
    ).rejects.toThrow('QUICK_MESSAGE_NOT_ALLOWED');
    await expect(
      service.saveQuickMessage(carla, matchId, '¡Vamos!'),
    ).rejects.toThrow('NOT_A_PLAYER');
  });

  it('sin billetera, la apuesta falla cerrada (WALLET_NOT_CONFIGURED)', async () => {
    const { fake, service } = setup();
    void fake;
    const noWallet = new GameService(
      fake as never,
      { get: () => 1000 } as never,
      { create: jest.fn() } as never,
      { listSpectators: jest.fn(async () => ({ count: 0, names: [] })) } as never,
      new GameEngineRegistry(new RpsEngine()),
      undefined as never,
    );
    await expect(
      noWallet.createChallenge(ana, { stakeCredits: 10 }),
    ).rejects.toThrow('WALLET_NOT_CONFIGURED');
    void service;
  });

  it('historial propio con resultado', async () => {
    const { service } = setup();
    const { matchId } = await startMatch(service, ana, bruno, 'BEST_OF_1', 0);
    await playRound(service, matchId, 1, ana, 'ROCK', bruno, 'SCISSORS');
    const history = await service.listMatches(ana, {});
    expect(history.items).toHaveLength(1);
    expect(history.items[0].result).toBe('WIN');
    expect(history.items[0].opponent.username).toBe('bruno');
    // Campos planos del tipo Match del cliente web (sin ellos la página
    // de partida trataba a los jugadores como espectadores).
    expect(history.items[0].player1Id).toBe('u1');
    expect(history.items[0].player2Id).toBe('u2');
    expect(history.items[0].player1Username).toBe('ana');
    expect(history.items[0].player2Username).toBe('bruno');
    expect(history.items[0].score1).toBe(1);
    expect(history.items[0].score2).toBe(0);
  });
});

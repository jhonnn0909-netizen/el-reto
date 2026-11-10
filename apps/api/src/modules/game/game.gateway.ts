import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { DatabaseService } from '../../database/database.service';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { GameService } from './game.service';
import { PresenceService } from './presence.service';
import { UserRow } from './game.types';

interface WsUser extends AuthUser {
  displayName: string;
}

interface AuthedSocket extends Socket {
  data: {
    user?: WsUser;
    spectating?: Set<string>;
    /** Se resuelve cuando `handleConnection` termina (éxito o fallo). */
    authReady?: Promise<void>;
    authResolve?: () => void;
  };
}

/**
 * Gateway WebSocket `/game` (CONTRACTS.md §5).
 * Autenticación por token en el handshake (acepta también token de
 * invitado, mismo secreto). El gateway NO tiene lógica de juego:
 * delega todo en GameService y difunde sus eventos.
 *
 * Salas: `match:<id>` (jugadores + espectadores) y `user:<id>`
 * (notificaciones privadas). Los espectadores se unen con
 * `match:watch` (solo lectura): reciben el estado pero no pueden
 * jugar (403 SPECTATOR_READ_ONLY).
 */
@WebSocketGateway({
  namespace: '/game',
  cors: { origin: process.env.WEB_URL || 'http://localhost:3000', credentials: true },
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly game: GameService,
    private readonly presence: PresenceService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  afterInit(): void {
    // Reenvío de eventos del motor a las salas.
    this.game.events.on('match:state', (payload: { matchId: string }) => {
      void this.emitRoomState(payload.matchId);
    });
    this.game.events.on('match:committed', (payload: Record<string, unknown>) => {
      this.server.to(`match:${payload['matchId']}`).emit('match:committed', payload);
    });
    this.game.events.on('round:result', (payload: Record<string, unknown>) => {
      this.server.to(`match:${payload['matchId']}`).emit('round:result', payload);
    });
    this.game.events.on('match:finished', (payload: Record<string, unknown>) => {
      this.server.to(`match:${payload['matchId']}`).emit('match:finished', payload);
    });
    this.game.events.on('match:cancelled', (payload: Record<string, unknown>) => {
      this.server.to(`match:${payload['matchId']}`).emit('match:cancelled', payload);
    });
    this.game.events.on('challenge:created', (payload: Record<string, unknown>) => {
      this.server.emit('challenge:created', payload);
    });
    this.game.events.on('notification:new', (payload: { userId: string }) => {
      this.server.to(`user:${payload.userId}`).emit('notification:new', payload);
    });
  }

  private async emitRoomState(matchId: string): Promise<void> {
    try {
      const state = await this.game.getRoomState(matchId);
      this.server.to(`match:${matchId}`).emit('match:state', state);
    } catch (err) {
      this.logger.error(`No se pudo difundir el estado de ${matchId}: ${err}`);
    }
  }

  private async broadcastPresence(): Promise<void> {
    try {
      const online = await this.presence.getOnline();
      this.server.emit('presence:update', { online });
    } catch (err) {
      this.logger.error(`No se pudo difundir presencia: ${err}`);
    }
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    // La autenticación es asíncrona (consulta a BD) y socket.io entrega
    // los mensajes del cliente en cuanto llega el `connect`, ANTES de
    // que este método termine: sin esta promesa, un `match:join`
    // inmediato veía `client.data.user` sin definir y fallaba con
    // UNAUTHORIZED aunque el token fuera válido (detectado en la
    // prueba en vivo: el segundo jugador no entraba a la sala).
    // Los manejadores esperan a `authReady` vía `getUser()`.
    let authResolve!: () => void;
    client.data.authReady = new Promise<void>((resolve) => {
      authResolve = resolve;
    });
    client.data.authResolve = authResolve;
    const done = () => authResolve();
    const token =
      (client.handshake.auth?.['token'] as string | undefined) ??
      (client.handshake.query?.['token'] as string | undefined);
    if (!token) {
      client.emit('error', { code: 'UNAUTHORIZED', message: 'Falta el token.' });
      client.disconnect(true);
      done();
      return;
    }
    let payload: Record<string, unknown>;
    try {
      payload = this.jwt.verify<Record<string, unknown>>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
    } catch {
      client.emit('error', { code: 'INVALID_TOKEN', message: 'Token inválido.' });
      client.disconnect(true);
      done();
      return;
    }
    const userId = payload['sub'];
    if (typeof userId !== 'string' || !userId) {
      client.emit('error', { code: 'INVALID_TOKEN', message: 'Token inválido.' });
      client.disconnect(true);
      done();
      return;
    }
    const res = await this.db.query<UserRow>(
      'SELECT id, username, display_name, role FROM users WHERE id = $1',
      [userId],
    );
    const row = res.rows[0];
    if (!row || (row.role !== 'USER' && row.role !== 'ADMIN' && row.role !== 'GUEST')) {
      client.emit('error', { code: 'INVALID_TOKEN', message: 'Token inválido.' });
      client.disconnect(true);
      done();
      return;
    }
    client.data.user = {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    };
    client.data.spectating = new Set<string>();
    await client.join(`user:${row.id}`);
    await this.presence.heartbeat(row.id);
    await this.broadcastPresence();
    done();
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    const user = client.data.user;
    if (!user) return;
    for (const matchId of client.data.spectating ?? []) {
      await this.presence.removeSpectator(matchId, user.id);
    }
    await this.presence.remove(user.id);
    await this.broadcastPresence();
  }

  /**
   * Usuario autenticado del socket. Espera a que termine la
   * autenticación del handshake (ver `handleConnection`): un mensaje
   * que llega antes no debe fallar con UNAUTHORIZED.
   */
  private async getUser(client: AuthedSocket): Promise<WsUser> {
    if (client.data.authReady) await client.data.authReady;
    const user = client.data.user;
    if (!user) throw new Error('UNAUTHORIZED');
    return user;
  }

  private fail(client: AuthedSocket, err: unknown): void {
    const message = errorMessage(err);
    // El código de error viaja en el mensaje (p. ej. INVALID_REVEAL,
    // SPECTATOR_READ_ONLY), como en el resto de la API REST.
    client.emit('error', { code: message, message });
  }

  @SubscribeMessage('match:join')
  async onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId: string },
  ): Promise<void> {
    try {
      const user = await this.getUser(client);
      await this.game.assertMatchPlayer(user.id, body.matchId);
      await client.join(`match:${body.matchId}`);
      const state = await this.game.getMatchState(user.id, body.matchId);
      client.emit('match:state', state);
    } catch (err) {
      this.fail(client, err);
    }
  }

  @SubscribeMessage('match:watch')
  async onWatch(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId: string },
  ): Promise<void> {
    try {
      const user = await this.getUser(client);
      // Solo partidas públicas (o propias): la privada exige invitación.
      const state = await this.game.getMatchState(user.id, body.matchId);
      await client.join(`match:${body.matchId}`);
      if (state.asSpectator) {
        await this.presence.addSpectator(
          body.matchId,
          user.id,
          user.displayName,
        );
        client.data.spectating?.add(body.matchId);
        // Refrescar el estado con el espectador incluido.
        const refreshed = await this.game.getRoomState(body.matchId);
        this.server.to(`match:${body.matchId}`).emit('match:state', refreshed);
      } else {
        client.emit('match:state', state);
      }
    } catch (err) {
      this.fail(client, err);
    }
  }

  @SubscribeMessage('match:leave')
  async onLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId: string },
  ): Promise<void> {
    const user = client.data.user;
    await client.leave(`match:${body.matchId}`);
    if (user && client.data.spectating?.has(body.matchId)) {
      client.data.spectating.delete(body.matchId);
      await this.presence.removeSpectator(body.matchId, user.id);
    }
  }

  @SubscribeMessage('match:commit')
  async onCommit(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId: string; round: number; commitHash: string },
  ): Promise<void> {
    try {
      const user = await this.getUser(client);
      this.assertNotSpectator(client, body.matchId);
      await this.game.commitMove(user, body.matchId, body.round, body.commitHash);
    } catch (err) {
      this.fail(client, err);
    }
  }

  @SubscribeMessage('match:reveal')
  async onReveal(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { matchId: string; round: number; move: string; secret: string },
  ): Promise<void> {
    try {
      const user = await this.getUser(client);
      this.assertNotSpectator(client, body.matchId);
      const move = body.move;
      if (move !== 'ROCK' && move !== 'PAPER' && move !== 'SCISSORS') {
        throw new Error('INVALID_MOVE');
      }
      await this.game.revealMove(user, body.matchId, body.round, move, body.secret);
    } catch (err) {
      this.fail(client, err);
    }
  }

  @SubscribeMessage('match:message')
  async onQuickMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { matchId: string; text: string },
  ): Promise<void> {
    try {
      const user = await this.getUser(client);
      this.assertNotSpectator(client, body.matchId);
      const msg = await this.game.saveQuickMessage(user, body.matchId, body.text);
      this.server.to(`match:${body.matchId}`).emit('match:message', msg);
    } catch (err) {
      this.fail(client, err);
    }
  }

  @SubscribeMessage('presence:heartbeat')
  async onHeartbeat(@ConnectedSocket() client: AuthedSocket): Promise<void> {
    try {
      const user = await this.getUser(client);
      await this.presence.heartbeat(user.id);
      await this.broadcastPresence();
    } catch (err) {
      this.fail(client, err);
    }
  }

  /** Un espectador (solo lectura) no puede jugar en esa partida. */
  private assertNotSpectator(client: AuthedSocket, matchId: string): void {
    if (client.data.spectating?.has(matchId)) {
      throw new Error('SPECTATOR_READ_ONLY');
    }
  }
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'getResponse' in err) {
    const res = (err as { getResponse(): unknown }).getResponse();
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object' && 'message' in res) {
      const m = (res as { message: unknown }).message;
      if (typeof m === 'string') return m;
      if (Array.isArray(m)) return String(m[0]);
    }
  }
  if (err instanceof Error) return err.message;
  return 'ERROR';
}

import { EventEmitter } from 'events';
import { GameGateway } from './game.gateway';

function makeSocket() {
  return {
    handshake: { auth: {}, query: {} },
    data: {} as any,
    join: jest.fn(async () => undefined),
    leave: jest.fn(async () => undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function setup() {
  const game = {
    events: new EventEmitter(),
    assertMatchPlayer: jest.fn(async () => ({ id: 'm1' })),
    getMatchState: jest.fn(async () => ({ id: 'm1', asSpectator: false })),
    getRoomState: jest.fn(async () => ({ id: 'm1', asSpectator: true })),
    commitMove: jest.fn(async () => ({})),
    revealMove: jest.fn(async () => ({})),
    saveQuickMessage: jest.fn(async (_u: any, m: string, t: string) => ({
      matchId: m,
      playerId: 'u1',
      displayName: 'Ana',
      text: t,
      at: new Date().toISOString(),
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
  const server = {
    to: jest.fn(() => ({ emit: jest.fn() })),
    emit: jest.fn(),
  };
  const gateway = new GameGateway(
    game as never,
    presence as never,
    { verify: jest.fn() } as never,
    { get: jest.fn(() => 'secret') } as never,
    { query: jest.fn() } as never,
  );
  (gateway as any).server = server;
  return { game, presence, server, gateway };
}

const user = { id: 'u1', username: 'ana', displayName: 'Ana', role: 'USER' as const };

describe('GameGateway', () => {
  it('el espectador recibe el estado pero no puede jugar (403)', async () => {
    const { game, gateway } = setup();
    const client = makeSocket();
    client.data.user = user;
    client.data.spectating = new Set(['m1']);
    await gateway.onCommit(client as never, {
      matchId: 'm1',
      round: 1,
      commitHash: 'a'.repeat(64),
    });
    expect(game.commitMove).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'SPECTATOR_READ_ONLY' }),
    );
    await gateway.onReveal(client as never, {
      matchId: 'm1',
      round: 1,
      move: 'ROCK',
      secret: 's',
    });
    expect(game.revealMove).not.toHaveBeenCalled();
  });

  it('el jugador sí puede jugar por WS', async () => {
    const { game, gateway } = setup();
    const client = makeSocket();
    client.data.user = user;
    client.data.spectating = new Set();
    await gateway.onCommit(client as never, {
      matchId: 'm1',
      round: 1,
      commitHash: 'a'.repeat(64),
    });
    expect(game.commitMove).toHaveBeenCalledWith(
      user,
      'm1',
      1,
      'a'.repeat(64),
    );
    expect(client.emit).not.toHaveBeenCalledWith(
      'error',
      expect.anything(),
    );
  });

  it('match:watch une a la sala como espectador y registra presencia', async () => {
    const { game, presence, gateway } = setup();
    (game.getMatchState as jest.Mock).mockResolvedValue({
      id: 'm1',
      asSpectator: true,
    });
    const client = makeSocket();
    client.data.user = user;
    client.data.spectating = new Set();
    await gateway.onWatch(client as never, { matchId: 'm1' });
    expect(client.join).toHaveBeenCalledWith('match:m1');
    expect(presence.addSpectator).toHaveBeenCalledWith('m1', 'u1', 'Ana');
    expect(client.data.spectating.has('m1')).toBe(true);
  });

  it('mensaje rápido permitido se difunde; el no permitido se rechaza', async () => {
    const { game, server, gateway } = setup();
    (game.saveQuickMessage as jest.Mock).mockRejectedValueOnce(
      new Error('QUICK_MESSAGE_NOT_ALLOWED'),
    );
    const client = makeSocket();
    client.data.user = user;
    client.data.spectating = new Set();
    await gateway.onQuickMessage(client as never, {
      matchId: 'm1',
      text: 'texto libre no permitido',
    });
    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'QUICK_MESSAGE_NOT_ALLOWED' }),
    );
    await gateway.onQuickMessage(client as never, {
      matchId: 'm1',
      text: '¡Vamos!',
    });
    expect(server.to).toHaveBeenCalledWith('match:m1');
  });
});

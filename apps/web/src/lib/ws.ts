// Cliente WebSocket (socket.io) del namespace /game.
// El token JWT se envía en el handshake (auth.token).
// Ver CONTRACTS.md §5 para la lista completa de eventos.
import { io, type Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function getGameSocket(token: string): Socket {
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();
  socket = io(`${WS_URL}/game`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
  });
  return socket;
}

export function disconnectGameSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Cliente WebSocket (socket.io) del namespace /game.
// El token JWT se envía en el handshake (auth.token).
// Ver CONTRACTS.md §5 para la lista completa de eventos.
import { io, type Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

let socket: Socket | null = null;
/** Token con el que se autenticó el socket actual. */
let socketToken: string | null = null;

export function getGameSocket(token: string): Socket {
  // El socket es único por pestaña: si el usuario cambió de sesión
  // en la misma pestaña, el socket seguía autenticado con el token
  // ANTERIOR y todos los mensajes (match:join, match:commit,
  // match:reveal) iban como el usuario anterior — el servidor los
  // rechazaba o los atribuía mal. Con otro token se reconecta.
  if (socket && socketToken !== token) {
    socket.disconnect();
    socket = null;
    socketToken = null;
  }
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();
  socket = io(`${WS_URL}/game`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
  });
  socketToken = token;
  return socket;
}

export function disconnectGameSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketToken = null;
  }
}

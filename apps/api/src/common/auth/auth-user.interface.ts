/**
 * Usuario autenticado (JWT) tal como lo ve el backend.
 * El AuthModule emite el token con estos campos; el rol GUEST identifica
 * a los invitados (CONTRACTS.md §9.2). El guard canónico es del
 * AuthModule: este guard provisional existe para que los módulos de
 * juego y notificaciones puedan validar el token sin depender de que
 * AuthModule esté conectado todavía. El coordinador debe unificarlos.
 */
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: 'USER' | 'ADMIN' | 'GUEST';
}

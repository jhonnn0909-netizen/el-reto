import { PoolClient } from 'pg';

/**
 * Puerto hacia la billetera DEMO (módulo Wallet, CONTRACTS.md §3.2).
 *
 * Lo implementa `WalletPortAdapter` (game/wallet.adapter.ts) sobre
 * `WalletService`: cada operación se ejecuta DENTRO de la transacción
 * PostgreSQL que le pasa el motor (mismo `client` que cierra la
 * partida), con doble partida en `wallet_transactions`/`ledger_entries`,
 * bloqueo de fila (`SELECT ... FOR UPDATE`) y `idempotency_key` único
 * por operación.
 *
 * Semántica esperada (créditos virtuales DEMO, sin valor real):
 * - holdBet: mueve `amount` de disponible a reservado del usuario
 *   (BET_HOLD; contrapartida: cuenta de sistema ESCROW).
 * - releaseBet: devuelve la reserva a disponible (BET_RELEASE).
 * - payoutWin: el ganador recibe el bote (`pot` = 2 × apuesta):
 *   su reserva + la del perdedor, como WIN_PAYOUT.
 * - payoutDailyPrize: paga el premio del reto diario desde la cuenta
 *   de sistema PROMO (WIN_PAYOUT con referencia al reto diario).
 */
export const WALLET_PORT = 'WALLET_PORT';

export interface WalletPort {
  holdBet(
    client: PoolClient,
    args: { userId: string; amount: number; referenceId: string },
  ): Promise<void>;
  releaseBet(
    client: PoolClient,
    args: { userId: string; amount: number; referenceId: string },
  ): Promise<void>;
  payoutWin(
    client: PoolClient,
    args: { winnerId: string; pot: number; referenceId: string },
  ): Promise<void>;
  payoutDailyPrize(
    client: PoolClient,
    args: { winnerId: string; amount: number; referenceId: string },
  ): Promise<void>;
}

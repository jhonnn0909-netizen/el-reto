import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { WalletService } from '../wallet/wallet.service';
import { WalletPort } from './wallet-port';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adaptador billetera↔juego (integración, CONTRACTS.md §3.2/§4.4).
 *
 * Implementa `WalletPort` sobre `WalletService` ejecutando cada operación
 * DENTRO de la transacción PostgreSQL que le pasa el motor de juego (el
 * mismo `PoolClient` que crea/cierra la partida y actualiza el ranking),
 * mediante los núcleos transaccionales `holdStakeInTx` /
 * `releaseStakeInTx` / `payoutInTx` / `grantDailyPrizeInTx`. Así la
 * reserva, la liquidación del bote y el premio diario se confirman o se
 * revierten junto con la partida. Antes de este adaptador,
 * `WalletService` abría su propia transacción en cada método y el puerto
 * no se podía cumplir (las apuestas fallaban cerradas con 503
 * `WALLET_NOT_CONFIGURED`).
 *
 * `referenceId` del juego NO es un UUID (`challenge:<id>:<userId>`,
 * `match:<id>`, `daily:<id>:<userId>`), mientras que
 * `wallet_transactions.reference_id` es UUID: el adaptador extrae el
 * UUID que corresponde (partida o reto) o pasa `null`. La idempotencia
 * NO depende de ese campo: cada operación usa su propia
 * `idempotencyKey` (`hold:` / `release:` / `payout:` / `daily-prize:` +
 * el `referenceId` completo del juego).
 *
 * `payoutWin` recibe solo `{winnerId, pot, referenceId}` (firma del
 * puerto, sin cambios para no tocar los tests del motor): el perdedor
 * se resuelve aquí consultando la partida `match:<id>` y el bote es
 * `pot = 2 × apuesta`, por lo que la apuesta es `pot / 2`.
 */
@Injectable()
export class WalletPortAdapter implements WalletPort {
  constructor(
    private readonly wallet: WalletService,
    private readonly db: DatabaseService,
  ) {}

  async holdBet(
    client: PoolClient,
    args: { userId: string; amount: number; referenceId: string },
  ): Promise<void> {
    await this.wallet.holdStakeInTx(client, args.userId, args.amount, {
      idempotencyKey: `hold:${args.referenceId}`,
      referenceId: referenceUuid(args.referenceId),
    });
  }

  async releaseBet(
    client: PoolClient,
    args: { userId: string; amount: number; referenceId: string },
  ): Promise<void> {
    await this.wallet.releaseStakeInTx(client, args.userId, args.amount, {
      idempotencyKey: `release:${args.referenceId}`,
      referenceId: referenceUuid(args.referenceId),
    });
  }

  async payoutWin(
    client: PoolClient,
    args: { winnerId: string; pot: number; referenceId: string },
  ): Promise<void> {
    const matchId = referenceUuid(args.referenceId);
    if (!matchId) {
      throw new BadRequestException('WALLET_REFERENCE_INVALID');
    }
    if (!Number.isInteger(args.pot) || args.pot <= 0 || args.pot % 2 !== 0) {
      throw new BadRequestException('INVALID_POT');
    }
    const stake = args.pot / 2;
    const { rows } = await client.query<{ player1_id: string; player2_id: string }>(
      'SELECT player1_id, player2_id FROM matches WHERE id = $1',
      [matchId],
    );
    const match = rows[0];
    if (!match) {
      throw new NotFoundException('MATCH_NOT_FOUND');
    }
    const loserId =
      match.player1_id === args.winnerId ? match.player2_id : match.player1_id;
    if (loserId === args.winnerId) {
      throw new BadRequestException('PAYOUT_SAME_PLAYER');
    }
    await this.wallet.payoutInTx(
      client,
      matchId,
      args.winnerId,
      loserId,
      stake,
      `payout:${matchId}`,
    );
  }

  async payoutDailyPrize(
    client: PoolClient,
    args: { winnerId: string; amount: number; referenceId: string },
  ): Promise<void> {
    await this.wallet.grantDailyPrizeInTx(client, args.winnerId, args.amount, {
      idempotencyKey: `daily-prize:${args.referenceId}`,
      referenceId: referenceUuid(args.referenceId),
    });
  }
}

/**
 * Extrae el UUID de referencia de los `referenceId` que usa el motor:
 * - `match:<matchId>` / `match:<matchId>:<userId>` → el UUID de partida.
 * - `challenge:<challengeId>:<userId>` → el UUID del reto.
 * - `daily:<challengeId>:<userId>` → el UUID del reto diario.
 * - `challenge:<userId>:<timestamp>` (crear reto: aún no hay reto ni
 *   partida) → `null` (el segundo segmento es un timestamp, no un UUID).
 */
function referenceUuid(referenceId: string): string | null {
  const parts = referenceId.split(':');
  const isUuid = (s: string | undefined): s is string =>
    typeof s === 'string' && UUID_RE.test(s);
  if (parts[0] === 'match' && isUuid(parts[1])) return parts[1];
  if (
    parts[0] === 'challenge' &&
    isUuid(parts[1]) &&
    isUuid(parts[2])
  ) {
    return parts[1];
  }
  if (parts[0] === 'daily' && isUuid(parts[1])) return parts[1];
  return null;
}

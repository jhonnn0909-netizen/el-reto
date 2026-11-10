import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import {
  AdminTransactionsQueryDto,
  CreatePromoCodeDto,
  MovementsQueryDto,
} from './dto/wallet.dto';
import {
  AuthUser,
  CURRENCY,
  DEMO,
  LedgerDirection,
  LedgerEntryResponse,
  LedgerLeg,
  LegKind,
  PaginatedMovements,
  PromoCodeResponse,
  ReconcileResult,
  Role,
  SystemAccountCode,
  TransactionResponse,
  WalletResponse,
  WalletTransactionStatus,
  WalletTransactionType,
} from './wallet.types';

/**
 * Billetera virtual DEMO/SANDBOX (CONTRACTS.md §3.2, §4.3, §9.2).
 *
 * - Créditos EXCLUSIVAMENTE virtuales, moneda `CREDITO` (entero, sin
 *   decimales), sin dinero real, sin pagos reales, sin apuestas reales.
 * - Toda operación es UNA transacción PostgreSQL con `SELECT ... FOR
 *   UPDATE` sobre las cuentas afectadas y control de `version` optimista.
 * - `idempotency_key` único: repetir la misma clave devuelve la
 *   transacción original sin duplicar asientos; misma clave con distinto
 *   usuario/tipo/importe -> 409 `IDEMPOTENCY_KEY_CONFLICT`.
 * - Saldo insuficiente -> `INSUFFICIENT_CREDITS`, sin asientos.
 * - Doble gasto imposible: transacción atómica + CHECK saldo >= 0.
 * - Reverso NUNCA borra ni edita asientos: crea una transacción REVERSAL
 *   con asientos compensatorios. Solo cambia `wallet_transactions.status`
 *   a `REVERSED` (tabla de transacciones, no del ledger: los triggers de
 *   `ledger_entries` siguen intactos).
 * - Invitados (rol GUEST) NO tienen billetera: todo método lanza 403
 *   `GUEST_WALLET_NOT_ALLOWED` (además del 403 del controlador).
 * - HOUSE siempre 0 en el MVP. ESCROW también 0 (ver wallet.types.ts).
 *
 * CONTABILIDAD (ver wallet.types.ts para la convención de signos):
 * - Usuario: DEBIT suma, CREDIT resta. Sistema: CREDIT suma, DEBIT resta.
 * - Retiro simulado: la contrapartida se reparte entre MINT y PROMO
 *   según disponibilidad, para no dejar nunca un saldo de sistema en
 *   negativo (los créditos son fungibles y un usuario puede retirar
 *   créditos de origen promocional). Invariante global:
 *   Σ usuarios (available + reserved) = MINT + PROMO.
 */
interface DbExecutor {
  // Intencionadamente sin genérico: DatabaseService.query exige
  // `T extends QueryResultRow` y PoolClient.query tiene sus propias
  // sobrecargas; un genérico propio aquí los haría incompatibles.
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: any[]; rowCount: number | null }>;
}

interface WalletAccountRow {
  id: string;
  user_id: string;
  available_balance: number;
  reserved_balance: number;
  version: number;
}

interface SystemAccountRow {
  id: string;
  code: string;
  available_balance: number;
  reserved_balance: number;
  version: number;
}

interface WalletTransactionRow {
  id: string;
  idempotency_key: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  user_id: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string;
  metadata: Record<string, any>;
  created_at: Date | string;
  completed_at: Date | string | null;
}

interface LedgerEntryRow {
  id: number;
  transaction_id: string;
  account_type: 'USER' | 'SYSTEM';
  account_id: string;
  direction: LedgerDirection;
  amount: number;
  balance_after: number;
  created_at: Date | string;
}

interface PromoCodeRow {
  id: string;
  code: string;
  credits: number;
  max_uses: number;
  used_count: number;
  expires_at: Date | string | null;
  active: boolean;
  created_by: string | null;
  created_at: Date | string;
}

const TX_COLUMNS =
  'id, idempotency_key, type, status, user_id, reference_type, reference_id, description, metadata, created_at, completed_at';

@Injectable()
export class WalletService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private get welcomeCredits(): number {
    return this.config.get<number>('demo.welcomeCredits', 1000);
  }

  private get dailyDepositLimit(): number {
    return this.config.get<number>('demo.dailyDepositLimit', 10000);
  }

  private get maxStake(): number {
    return this.config.get<number>('demo.maxStake', 1000);
  }

  // ------------------------------------------------------------------
  // Lectura (usuarios)
  // ------------------------------------------------------------------

  async getWallet(userId: string): Promise<WalletResponse> {
    const user = await this.loadUserRole(this.db, userId, ['USER', 'ADMIN']);
    void user;
    const { rows } = await this.db.query<WalletAccountRow>(
      'SELECT id, user_id, available_balance, reserved_balance, version FROM wallet_accounts WHERE user_id = $1',
      [userId],
    );
    const account = rows[0];
    if (!account) {
      throw new NotFoundException('WALLET_NOT_FOUND');
    }
    return this.toWalletResponse(account);
  }

  async getBalance(userId: string): Promise<WalletResponse> {
    return this.getWallet(userId);
  }

  async listMovements(
    userId: string,
    query: MovementsQueryDto,
  ): Promise<PaginatedMovements> {
    await this.loadUserRole(this.db, userId, ['USER', 'ADMIN']);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const where = ['user_id = $1'];
    const params: unknown[] = [userId];
    if (query.type) {
      params.push(query.type);
      where.push(`type = $${params.length}`);
    }
    const listSql =
      `SELECT ${TX_COLUMNS} FROM wallet_transactions WHERE ${where.join(' AND ')} ` +
      `ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const { rows } = await this.db.query<WalletTransactionRow>(listSql, [
      ...params,
      limit,
      offset,
    ]);
    const countSql =
      `SELECT COUNT(*)::bigint AS total FROM wallet_transactions WHERE ${where.join(' AND ')}`;
    const count = await this.db.query<{ total: string }>(countSql, params);
    const total = Number(count.rows[0]?.total ?? 0);
    const ownerWalletId = await this.loadWalletId(this.db, userId);
    const data: TransactionResponse[] = [];
    for (const row of rows) {
      const entries = await this.loadEntries(this.db, row.id);
      data.push(this.toTransactionResponse(row, entries, ownerWalletId));
    }
    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ------------------------------------------------------------------
  // Operaciones de usuario (CONTRACTS.md §4.3)
  // ------------------------------------------------------------------

  async deposit(
    userId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<TransactionResponse> {
    this.assertPositiveInt(amount, 'amount');
    return this.db.transaction((client) =>
      this.runUserOperation(client, {
        userId,
        type: 'DEPOSIT',
        amount,
        idempotencyKey,
        description: 'Depósito virtual DEMO (simulado, sin dinero real)',
        referenceType: 'DEMO_DEPOSIT',
        referenceId: null,
        apply: async (ctx) => {
          const daily = await this.dailyDepositTotal(client, userId);
          if (daily + amount > this.dailyDepositLimit) {
            throw new BadRequestException('DAILY_DEPOSIT_LIMIT_EXCEEDED');
          }
          const wallet = ctx.wallet;
          const mint = await this.loadSystemForUpdate(client, 'MINT');
          const newAvailable = wallet.available_balance + amount;
          await this.updateWallet(client, wallet, newAvailable, wallet.reserved_balance);
          await this.updateSystem(client, mint, mint.available_balance + amount);
          return {
            legs: [
              this.leg('user-available', 'USER', wallet.id, 'DEBIT', amount),
              this.leg('system', 'SYSTEM', mint.id, 'CREDIT', amount),
            ],
            balanceAfter: new Map<string, number>([
              [wallet.id, newAvailable + wallet.reserved_balance],
              [mint.id, mint.available_balance + amount],
            ]),
          };
        },
      }),
    );
  }

  async withdraw(
    userId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<TransactionResponse> {
    this.assertPositiveInt(amount, 'amount');
    return this.db.transaction((client) =>
      this.runUserOperation(client, {
        userId,
        type: 'WITHDRAWAL',
        amount,
        idempotencyKey,
        description: 'Retiro simulado DEMO (sin salida de dinero real)',
        referenceType: 'DEMO_WITHDRAWAL',
        referenceId: null,
        apply: async (ctx) => {
          const wallet = ctx.wallet;
          if (wallet.available_balance < amount) {
            throw new BadRequestException('INSUFFICIENT_CREDITS');
          }
          const mint = await this.loadSystemForUpdate(client, 'MINT');
          const promo = await this.loadSystemForUpdate(client, 'PROMO');
          // Contrapartida repartida MINT/PROMO (ver comentario de clase):
          // nunca deja un saldo de sistema en negativo.
          const mintPart = Math.min(amount, mint.available_balance);
          const promoPart = amount - mintPart;
          if (promoPart > 0 && promo.available_balance < promoPart) {
            // No debería ocurrir si se mantiene el invariante global; si
            // ocurre, la conciliación lo señalaría. No inventar saldo.
            throw new InternalServerErrorException('SYSTEM_ACCOUNT_INCONSISTENT');
          }
          const newAvailable = wallet.available_balance - amount;
          await this.updateWallet(client, wallet, newAvailable, wallet.reserved_balance);
          const legs: LedgerLeg[] = [
            this.leg('user-available', 'USER', wallet.id, 'CREDIT', amount),
          ];
          const balanceAfter = new Map<string, number>([
            [wallet.id, newAvailable + wallet.reserved_balance],
          ]);
          if (mintPart > 0) {
            await this.updateSystem(client, mint, mint.available_balance - mintPart);
            legs.push(this.leg('system', 'SYSTEM', mint.id, 'DEBIT', mintPart));
            balanceAfter.set(mint.id, mint.available_balance - mintPart);
          }
          if (promoPart > 0) {
            await this.updateSystem(client, promo, promo.available_balance - promoPart);
            legs.push(this.leg('system', 'SYSTEM', promo.id, 'DEBIT', promoPart));
            balanceAfter.set(promo.id, promo.available_balance - promoPart);
          }
          return { legs, balanceAfter };
        },
      }),
    );
  }

  async redeemPromo(
    userId: string,
    code: string,
  ): Promise<TransactionResponse> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('PROMO_CODE_REQUIRED');
    }
    return this.db.transaction(async (client) => {
      await this.loadUserRole(client, userId, ['USER', 'ADMIN']);
      const promo = await this.loadPromoForUpdate(client, normalized);
      if (!promo) {
        throw new NotFoundException('PROMO_CODE_NOT_FOUND');
      }
      // Idempotencia: un usuario canjea cada código una sola vez; repetir
      // devuelve la transacción original.
      const { rows: redemptions } = await client.query<{
        transaction_id: string | null;
      }>(
        'SELECT id, promo_code_id, user_id, transaction_id, created_at FROM promo_redemptions WHERE promo_code_id = $1 AND user_id = $2',
        [promo.id, userId],
      );
      const existingRedemption = redemptions[0];
      if (existingRedemption?.transaction_id) {
        const tx = await this.findTxById(client, existingRedemption.transaction_id);
        if (tx) {
          const entries = await this.loadEntries(client, tx.id);
          return this.toTransactionResponse(tx, entries);
        }
      }
      if (!promo.active) {
        throw new BadRequestException('PROMO_CODE_INACTIVE');
      }
      if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
        throw new BadRequestException('PROMO_CODE_EXPIRED');
      }
      if (promo.used_count >= promo.max_uses) {
        throw new BadRequestException('PROMO_MAX_USES_REACHED');
      }
      const amount = promo.credits;
      const wallet = await this.loadWalletForUpdate(client, userId);
      const promoAccount = await this.loadSystemForUpdate(client, 'PROMO');
      const key = `promo:${promo.id}:${userId}`;
      const replay = await this.findTxByKey(client, key);
      if (replay) {
        return this.replayOrConflict(replay, userId, 'PROMO_CREDIT', amount, wallet.id);
      }
      const newAvailable = wallet.available_balance + amount;
      await this.updateWallet(client, wallet, newAvailable, wallet.reserved_balance);
      await this.updateSystem(client, promoAccount, promoAccount.available_balance + amount);
      const legs: LedgerLeg[] = [
        this.leg('user-available', 'USER', wallet.id, 'DEBIT', amount),
        this.leg('system', 'SYSTEM', promoAccount.id, 'CREDIT', amount),
      ];
      const balanceAfter = new Map<string, number>([
        [wallet.id, newAvailable + wallet.reserved_balance],
        [promoAccount.id, promoAccount.available_balance + amount],
      ]);
      const tx = await this.insertTransaction(client, {
        idempotencyKey: key,
        type: 'PROMO_CREDIT',
        userId,
        referenceType: 'PROMO_CODE',
        referenceId: promo.id,
        description: `Crédito promocional DEMO: código ${promo.code}`,
        metadata: { amount, code: promo.code, legs },
      });
      await this.insertEntries(client, tx.id, legs, balanceAfter);
      const { rowCount } = await client.query(
        'UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1 AND used_count < max_uses',
        [promo.id],
      );
      if (rowCount !== 1) {
        // Otro canje simultáneo agotó el código: la transacción revierte.
        throw new ConflictException('PROMO_MAX_USES_REACHED');
      }
      await client.query(
        'INSERT INTO promo_redemptions (promo_code_id, user_id, transaction_id) VALUES ($1, $2, $3) RETURNING id',
        [promo.id, userId, tx.id],
      );
      const entries = await this.loadEntries(client, tx.id);
      return this.toTransactionResponse(tx, entries, wallet.id);
    });
  }

  // ------------------------------------------------------------------
  // Integración con Auth: bono de bienvenida (CONTRACTS.md §4.1)
  // ------------------------------------------------------------------

  /**
   * Punto de integración con el módulo Auth: se llama al registrar un
   * usuario (y al convertir un invitado con `POST /auth/convert-guest`).
   * Crea la billetera si no existe y abona el bono de bienvenida
   * (`DEMO_WELCOME_CREDITS`, por defecto 1000) con contrapartida MINT.
   * Idempotente por clave `welcome:<userId>`: llamarlo dos veces no
   * duplica el bono. Los invitados (GUEST) no reciben bono ni billetera.
   * Devuelve `null` si el bono configurado es 0 (solo crea la cuenta).
   * No importa nada de Auth: evita importaciones circulares.
   */
  async grantWelcomeBonus(userId: string): Promise<TransactionResponse | null> {
    const amount = this.welcomeCredits;
    return this.db.transaction(async (client) => {
      await this.loadUserRole(client, userId, ['USER', 'ADMIN']);
      const key = `welcome:${userId}`;
      const replay = await this.findTxByKey(client, key);
      if (replay) {
        return this.replayOrConflict(replay, userId, 'WELCOME_BONUS', amount);
      }
      let wallet = await this.findWalletForUpdate(client, userId);
      if (!wallet) {
        wallet = await this.insertWallet(client, userId);
      }
      if (amount <= 0) {
        return null;
      }
      const mint = await this.loadSystemForUpdate(client, 'MINT');
      const newAvailable = wallet.available_balance + amount;
      await this.updateWallet(client, wallet, newAvailable, wallet.reserved_balance);
      await this.updateSystem(client, mint, mint.available_balance + amount);
      const legs: LedgerLeg[] = [
        this.leg('user-available', 'USER', wallet.id, 'DEBIT', amount),
        this.leg('system', 'SYSTEM', mint.id, 'CREDIT', amount),
      ];
      const balanceAfter = new Map<string, number>([
        [wallet.id, newAvailable + wallet.reserved_balance],
        [mint.id, mint.available_balance + amount],
      ]);
      const tx = await this.insertTransaction(client, {
        idempotencyKey: key,
        type: 'WELCOME_BONUS',
        userId,
        referenceType: 'REGISTRATION',
        referenceId: null,
        description: 'Bono de bienvenida DEMO (créditos virtuales, sin valor real)',
        metadata: { amount, legs },
      });
      await this.insertEntries(client, tx.id, legs, balanceAfter);
      const entries = await this.loadEntries(client, tx.id);
      return this.toTransactionResponse(tx, entries, wallet.id);
    });
  }

  // ------------------------------------------------------------------
  // Integración con el módulo de juego (CONTRACTS.md §4.4)
  // ------------------------------------------------------------------

  /**
   * Reserva la apuesta de un reto: available -> reserved (BET_HOLD).
   * Movimiento interno de la cuenta del usuario; el total no cambia.
   * `idempotencyKey` por defecto `hold:<matchId>:<userId>`.
   * El módulo de juego aún no existe: el método queda listo y
   * documentado para cuando lo llame.
   */
  async holdStake(
    userId: string,
    matchId: string,
    amount: number,
    idempotencyKey?: string,
  ): Promise<TransactionResponse> {
    const key = idempotencyKey ?? `hold:${matchId}:${userId}`;
    return this.db.transaction((client) =>
      this.holdStakeInTx(client, userId, amount, {
        idempotencyKey: key,
        referenceId: matchId,
      }),
    );
  }

  /**
   * Núcleo transaccional de `holdStake` (integración juego↔billetera,
   * WalletPort): ejecuta la reserva DENTRO de la transacción PostgreSQL
   * que pasa el llamante (el mismo `client` con el que el motor de juego
   * crea/cierra la partida), sin abrir una transacción propia. Así la
   * reserva y la partida se confirman o se revierten juntas (atomicidad
   * del cierre de partida, CONTRACTS.md §3.2/§4.4). `referenceId` es el
   * UUID de la partida/reto cuando se conoce, o `null` (p. ej. al crear
   * un reto, que aún no tiene partida); la idempotencia la da
   * `idempotencyKey`, no `referenceId`.
   */
  async holdStakeInTx(
    client: PoolClient,
    userId: string,
    amount: number,
    opts: {
      idempotencyKey: string;
      referenceId?: string | null;
      description?: string;
    },
  ): Promise<TransactionResponse> {
    this.assertPositiveInt(amount, 'amount');
    if (amount > this.maxStake) {
      throw new BadRequestException('STAKE_EXCEEDS_MAX');
    }
    return this.runUserOperation(client, {
      userId,
      type: 'BET_HOLD',
      amount,
      idempotencyKey: opts.idempotencyKey,
      description:
        opts.description ??
        (opts.referenceId
          ? `Reserva de apuesta DEMO para la partida ${opts.referenceId}`
          : 'Reserva de apuesta DEMO'),
      referenceType: 'MATCH',
      referenceId: opts.referenceId ?? null,
      apply: async (ctx) => {
        const wallet = ctx.wallet;
        if (wallet.available_balance < amount) {
          throw new BadRequestException('INSUFFICIENT_CREDITS');
        }
        const newAvailable = wallet.available_balance - amount;
        const newReserved = wallet.reserved_balance + amount;
        await this.updateWallet(client, wallet, newAvailable, newReserved);
        const total = newAvailable + newReserved;
        return {
          legs: [
            this.leg('user-available', 'USER', wallet.id, 'CREDIT', amount),
            this.leg('user-reserved', 'USER', wallet.id, 'DEBIT', amount),
          ],
          balanceAfter: new Map<string, number>([[wallet.id, total]]),
        };
      },
    });
  }

  /**
   * Libera una reserva: reserved -> available (BET_RELEASE).
   * Se usa al cancelar un reto/partida o al devolver su propia apuesta
   * al ganador antes del pago del premio (ver `payout`).
   */
  async releaseStake(
    userId: string,
    matchId: string,
    amount: number,
    idempotencyKey?: string,
  ): Promise<TransactionResponse> {
    const key = idempotencyKey ?? `release:${matchId}:${userId}`;
    return this.db.transaction((client) =>
      this.releaseStakeInTx(client, userId, amount, {
        idempotencyKey: key,
        referenceId: matchId,
      }),
    );
  }

  /**
   * Núcleo transaccional de `releaseStake` (integración juego↔billetera,
   * WalletPort): igual que `holdStakeInTx`, se ejecuta DENTRO de la
   * transacción del llamante, sin abrir una propia.
   */
  async releaseStakeInTx(
    client: PoolClient,
    userId: string,
    amount: number,
    opts: {
      idempotencyKey: string;
      referenceId?: string | null;
      description?: string;
    },
  ): Promise<TransactionResponse> {
    this.assertPositiveInt(amount, 'amount');
    return this.runUserOperation(client, {
      userId,
      type: 'BET_RELEASE',
      amount,
      idempotencyKey: opts.idempotencyKey,
      description:
        opts.description ??
        (opts.referenceId
          ? `Liberación de reserva DEMO de la partida ${opts.referenceId}`
          : 'Liberación de reserva DEMO'),
      referenceType: 'MATCH',
      referenceId: opts.referenceId ?? null,
      apply: async (ctx) => {
        const wallet = ctx.wallet;
        if (wallet.reserved_balance < amount) {
          throw new BadRequestException('INSUFFICIENT_CREDITS');
        }
        const newAvailable = wallet.available_balance + amount;
        const newReserved = wallet.reserved_balance - amount;
        await this.updateWallet(client, wallet, newAvailable, newReserved);
        const total = newAvailable + newReserved;
        return {
          legs: [
            this.leg('user-reserved', 'USER', wallet.id, 'CREDIT', amount),
            this.leg('user-available', 'USER', wallet.id, 'DEBIT', amount),
          ],
          balanceAfter: new Map<string, number>([[wallet.id, total]]),
        };
      },
    });
  }

  /**
   * Liquida una partida con apuesta: en UNA transacción de BD crea
   * 1) BET_RELEASE con la propia apuesta del ganador (reserved ->
   * available) y 2) WIN_PAYOUT con la apuesta del perdedor
   * (reserved del perdedor -> available del ganador).
   * El total en circulación no cambia: los créditos pasan de un
   * jugador al otro, sin crear ni destruir saldo.
   * `idempotencyKey` por defecto `payout:<matchId>`.
   * Devuelve `[releaseTx, payoutTx]`.
   */
  async payout(
    matchId: string,
    winnerId: string,
    loserId: string,
    stake: number,
    idempotencyKey?: string,
  ): Promise<TransactionResponse[]> {
    const key = idempotencyKey ?? `payout:${matchId}`;
    return this.db.transaction((client) =>
      this.payoutInTx(client, matchId, winnerId, loserId, stake, key),
    );
  }

  /**
   * Núcleo transaccional de `payout` (integración juego↔billetera,
   * WalletPort `payoutWin`): liquida la partida DENTRO de la transacción
   * del motor de juego (el mismo `client` que cierra la partida y
   * actualiza el ranking), sin abrir una transacción propia. Así el pago
   * del bote y el cierre de la partida se confirman o se revierten
   * juntos; antes cada método abría su propia transacción y el puerto
   * del juego no se podía cumplir (503 WALLET_NOT_CONFIGURED).
   */
  async payoutInTx(
    client: PoolClient,
    matchId: string,
    winnerId: string,
    loserId: string,
    stake: number,
    idempotencyKey: string,
  ): Promise<TransactionResponse[]> {
    this.assertPositiveInt(stake, 'stake');
    if (winnerId === loserId) {
      throw new BadRequestException('PAYOUT_SAME_PLAYER');
    }
    const key = idempotencyKey;
    {
      await this.loadUserRole(client, winnerId, ['USER', 'ADMIN']);
      await this.loadUserRole(client, loserId, ['USER', 'ADMIN']);
      const replay = await this.findTxByKey(client, key);
      if (replay) {
        const ownerWalletId = await this.loadWalletId(client, winnerId);
        return [this.replayOrConflict(replay, winnerId, 'WIN_PAYOUT', stake, ownerWalletId)];
      }
      // Bloqueo en orden fijo por id de cuenta para evitar deadlocks.
      const winnerWallet = await this.loadWalletForUpdate(client, winnerId);
      const loserWallet = await this.loadWalletForUpdate(client, loserId);
      if (winnerWallet.reserved_balance < stake || loserWallet.reserved_balance < stake) {
        throw new BadRequestException('INSUFFICIENT_CREDITS');
      }
      // 1) Devolver su propia apuesta al ganador.
      const winnerAvailable1 = winnerWallet.available_balance + stake;
      const winnerReserved1 = winnerWallet.reserved_balance - stake;
      await this.updateWallet(client, winnerWallet, winnerAvailable1, winnerReserved1);
      const releaseLegs: LedgerLeg[] = [
        this.leg('user-reserved', 'USER', winnerWallet.id, 'CREDIT', stake),
        this.leg('user-available', 'USER', winnerWallet.id, 'DEBIT', stake),
      ];
      const releaseTotal = winnerAvailable1 + winnerReserved1;
      const releaseTx = await this.insertTransaction(client, {
        idempotencyKey: `release:${matchId}:${winnerId}`,
        type: 'BET_RELEASE',
        userId: winnerId,
        referenceType: 'MATCH',
        referenceId: matchId,
        description: `Devolución de apuesta DEMO al ganador de la partida ${matchId}`,
        metadata: { amount: stake, legs: releaseLegs },
      });
      await this.insertEntries(
        client,
        releaseTx.id,
        releaseLegs,
        new Map([[winnerWallet.id, releaseTotal]]),
      );
      // 2) La apuesta del perdedor pasa al ganador.
      const loserAvailable = loserWallet.available_balance;
      const loserReserved = loserWallet.reserved_balance - stake;
      const winnerAvailable2 = winnerAvailable1 + stake;
      await this.updateWallet(client, loserWallet, loserAvailable, loserReserved);
      await this.updateWallet(
        client,
        { ...winnerWallet, version: winnerWallet.version + 1 },
        winnerAvailable2,
        winnerReserved1,
      );
      const payoutLegs: LedgerLeg[] = [
        this.leg('user-reserved', 'USER', loserWallet.id, 'CREDIT', stake),
        this.leg('user-available', 'USER', winnerWallet.id, 'DEBIT', stake),
      ];
      const payoutTx = await this.insertTransaction(client, {
        idempotencyKey: key,
        type: 'WIN_PAYOUT',
        userId: winnerId,
        referenceType: 'MATCH',
        referenceId: matchId,
        description: `Premio virtual DEMO de la partida ${matchId}`,
        metadata: { amount: stake, legs: payoutLegs },
      });
      await this.insertEntries(
        client,
        payoutTx.id,
        payoutLegs,
        new Map([
          [loserWallet.id, loserAvailable + loserReserved],
          [winnerWallet.id, winnerAvailable2 + winnerReserved1],
        ]),
      );
      const entries1 = await this.loadEntries(client, releaseTx.id);
      const entries2 = await this.loadEntries(client, payoutTx.id);
      return [
        this.toTransactionResponse(releaseTx, entries1, winnerWallet.id),
        this.toTransactionResponse(payoutTx, entries2, winnerWallet.id),
      ];
    }
  }

  /**
   * Premio del reto diario (integración juego↔billetera, WalletPort
   * `payoutDailyPrize`): abona `amount` créditos DEMO al ganador desde
   * la cuenta de sistema PROMO (transacción PROMO_CREDIT, misma
   * convención contable que `redeemPromo`: DEBIT al usuario, CREDIT a
   * PROMO). Se ejecuta DENTRO de la transacción que pasa el llamante
   * (el cierre de la partida), sin abrir una propia. Idempotente por
   * `idempotencyKey`. Los invitados no tienen billetera: el llamante
   * (motor de juego) los excluye antes de llamar.
   */
  async grantDailyPrizeInTx(
    client: PoolClient,
    userId: string,
    amount: number,
    opts: { idempotencyKey: string; referenceId?: string | null },
  ): Promise<TransactionResponse> {
    this.assertPositiveInt(amount, 'amount');
    await this.loadUserRole(client, userId, ['USER', 'ADMIN']);
    const replay = await this.findTxByKey(client, opts.idempotencyKey);
    if (replay) {
      return this.replayOrConflict(replay, userId, 'PROMO_CREDIT', amount);
    }
    const wallet = await this.loadWalletForUpdate(client, userId);
    const promo = await this.loadSystemForUpdate(client, 'PROMO');
    const newAvailable = wallet.available_balance + amount;
    await this.updateWallet(client, wallet, newAvailable, wallet.reserved_balance);
    await this.updateSystem(client, promo, promo.available_balance + amount);
    const legs: LedgerLeg[] = [
      this.leg('user-available', 'USER', wallet.id, 'DEBIT', amount),
      this.leg('system', 'SYSTEM', promo.id, 'CREDIT', amount),
    ];
    const balanceAfter = new Map<string, number>([
      [wallet.id, newAvailable + wallet.reserved_balance],
      [promo.id, promo.available_balance + amount],
    ]);
    const tx = await this.insertTransaction(client, {
      idempotencyKey: opts.idempotencyKey,
      type: 'PROMO_CREDIT',
      userId,
      referenceType: 'DAILY_CHALLENGE',
      referenceId: opts.referenceId ?? null,
      description: `Premio del reto diario DEMO (${amount} créditos virtuales)`,
      metadata: { amount, legs },
    });
    await this.insertEntries(client, tx.id, legs, balanceAfter);
    const entries = await this.loadEntries(client, tx.id);
    return this.toTransactionResponse(tx, entries, wallet.id);
  }

  // ------------------------------------------------------------------
  // Reverso compensatorio (solo admin, vía controlador admin)
  // ------------------------------------------------------------------

  /**
   * Crea una transacción REVERSAL con asientos compensatorios (dirección
   * invertida, mismos importes y cuentas) y marca la original como
   * REVERSED. NUNCA borra ni edita asientos del ledger: las filas de
   * `ledger_entries` quedan intactas y solo cambia `status` en
   * `wallet_transactions` (no cubierto por el trigger de inmutabilidad).
   * Idempotente por clave `reversal:<originalId>`: un segundo intento
   * devuelve el reverso original. Si la operación original ya se gastó
   * (p. ej. revertir un depósito ya retirado), falla con
   * INSUFFICIENT_CREDITS y no escribe nada.
   */
  async reverseTransaction(
    adminId: string,
    transactionId: string,
    reason: string,
    idempotencyKey?: string,
  ): Promise<TransactionResponse> {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('REVERSAL_REASON_REQUIRED');
    }
    const key = idempotencyKey ?? `reversal:${transactionId}`;
    return this.db.transaction(async (client) => {
      await this.loadUserRole(client, adminId, ['ADMIN']);
      const replay = await this.findTxByKey(client, key);
      if (replay) {
        const original = await this.findTxById(client, transactionId);
        const amount = Number(original?.metadata?.amount ?? 0);
        const ownerWalletId = await this.loadWalletId(client, replay.tx.user_id);
        return this.replayOrConflict(replay, replay.tx.user_id, 'REVERSAL', amount, ownerWalletId);
      }
      const original = await this.findTxById(client, transactionId);
      if (!original) {
        throw new NotFoundException('TRANSACTION_NOT_FOUND');
      }
      if (original.type === 'REVERSAL') {
        throw new ConflictException('TRANSACTION_NOT_REVERSIBLE');
      }
      if (original.status !== 'COMPLETED') {
        throw new ConflictException('TRANSACTION_NOT_REVERSIBLE');
      }
      const originalEntries = await this.loadEntries(client, original.id);
      const legs = (original.metadata?.legs as LedgerLeg[] | undefined) ?? null;
      if (!legs || legs.length !== originalEntries.length) {
        // Sin semántica de sub-saldos no se puede invertir con seguridad.
        throw new ConflictException('TRANSACTION_LEGS_MISSING');
      }
      // Bloquear todas las cuentas afectadas (orden fijo por id).
      const accountIds = [...new Set(legs.map((l) => l.accountId))].sort();
      const wallets = new Map<string, WalletAccountRow>();
      const systems = new Map<string, SystemAccountRow>();
      for (const accountId of accountIds) {
        const w = await this.loadWalletByIdForUpdate(client, accountId);
        if (w) {
          wallets.set(accountId, w);
          continue;
        }
        const s = await this.loadSystemByIdForUpdate(client, accountId);
        if (s) {
          systems.set(accountId, s);
        }
      }
      // Calcular los saldos invertidos y validar que ninguno es negativo.
      const newWalletBalances = new Map<string, { available: number; reserved: number }>();
      const newSystemBalances = new Map<string, number>();
      for (const leg of legs) {
        const inverted = leg.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT';
        if (leg.kind === 'system') {
          const sys = systems.get(leg.accountId);
          if (!sys) throw new InternalServerErrorException('SYSTEM_ACCOUNT_MISSING');
          const current = newSystemBalances.get(leg.accountId) ?? sys.available_balance;
          const next = current + (inverted === 'CREDIT' ? leg.amount : -leg.amount);
          if (next < 0) throw new BadRequestException('INSUFFICIENT_CREDITS');
          newSystemBalances.set(leg.accountId, next);
        } else {
          const wallet = wallets.get(leg.accountId);
          if (!wallet) throw new InternalServerErrorException('WALLET_NOT_FOUND');
          const current = newWalletBalances.get(leg.accountId) ?? {
            available: wallet.available_balance,
            reserved: wallet.reserved_balance,
          };
          const delta = inverted === 'DEBIT' ? leg.amount : -leg.amount;
          if (leg.kind === 'user-available') current.available += delta;
          else current.reserved += delta;
          if (current.available < 0 || current.reserved < 0) {
            throw new BadRequestException('INSUFFICIENT_CREDITS');
          }
          newWalletBalances.set(leg.accountId, current);
        }
      }
      for (const [accountId, bal] of newWalletBalances) {
        const wallet = wallets.get(accountId);
        if (wallet) {
          await this.updateWallet(client, wallet, bal.available, bal.reserved);
        }
      }
      for (const [accountId, available] of newSystemBalances) {
        const sys = systems.get(accountId);
        if (sys) {
          await this.updateSystem(client, sys, available);
        }
      }
      const invertedLegs: LedgerLeg[] = legs.map((leg) => ({
        ...leg,
        direction: leg.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      }));
      const balanceAfter = new Map<string, number>();
      for (const [accountId, bal] of newWalletBalances) {
        balanceAfter.set(accountId, bal.available + bal.reserved);
      }
      for (const [accountId, available] of newSystemBalances) {
        balanceAfter.set(accountId, available);
      }
      const amount = Number(original.metadata?.amount ?? 0);
      const tx = await this.insertTransaction(client, {
        idempotencyKey: key,
        type: 'REVERSAL',
        userId: original.user_id,
        referenceType: 'WALLET_TRANSACTION',
        referenceId: original.id,
        description: `Reverso DEMO de ${original.type} (${original.id}): ${reason.trim()}`,
        metadata: {
          amount,
          reason: reason.trim(),
          reversesTransactionId: original.id,
          legs: invertedLegs,
        },
      });
      await this.insertEntries(client, tx.id, invertedLegs, balanceAfter);
      const { rowCount } = await client.query(
        'UPDATE wallet_transactions SET status = $1 WHERE id = $2 AND status = $3',
        ['REVERSED', original.id, 'COMPLETED'],
      );
      if (rowCount !== 1) {
        throw new ConflictException('TRANSACTION_NOT_REVERSIBLE');
      }
      const entries = await this.loadEntries(client, tx.id);
      const ownerWalletId = await this.loadWalletId(client, original.user_id);
      return this.toTransactionResponse(tx, entries, ownerWalletId);
    });
  }

  // ------------------------------------------------------------------
  // Admin de billetera (solo lectura del ledger + crear promos)
  // ------------------------------------------------------------------

  async listTransactionsAdmin(
    adminId: string,
    query: AdminTransactionsQueryDto,
  ): Promise<PaginatedMovements> {
    await this.loadUserRole(this.db, adminId, ['ADMIN']);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.userId) {
      params.push(query.userId);
      where.push(`user_id = $${params.length}`);
    }
    if (query.type) {
      params.push(query.type);
      where.push(`type = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`status = $${params.length}`);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await this.db.query<WalletTransactionRow>(
      `SELECT ${TX_COLUMNS} FROM wallet_transactions ${clause} ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    const count = await this.db.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total FROM wallet_transactions ${clause}`,
      params,
    );
    const total = Number(count.rows[0]?.total ?? 0);
    const walletIds = new Map<string, string | null>();
    const data: TransactionResponse[] = [];
    for (const row of rows) {
      const entries = await this.loadEntries(this.db, row.id);
      let ownerWalletId = walletIds.get(row.user_id);
      if (ownerWalletId === undefined) {
        ownerWalletId = await this.loadWalletId(this.db, row.user_id);
        walletIds.set(row.user_id, ownerWalletId);
      }
      data.push(this.toTransactionResponse(row, entries, ownerWalletId));
    }
    return { data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async createPromoCode(
    adminId: string,
    dto: CreatePromoCodeDto,
  ): Promise<PromoCodeResponse> {
    await this.loadUserRole(this.db, adminId, ['ADMIN']);
    const code = dto.code.trim().toUpperCase();
    const { rows } = await this.db.query<PromoCodeRow>(
      'INSERT INTO promo_codes (code, credits, max_uses, expires_at, active, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, code, credits, max_uses, used_count, expires_at, active, created_by, created_at',
      [
        code,
        dto.credits,
        dto.maxUses ?? 1,
        dto.expiresAt ?? null,
        dto.active ?? true,
        adminId,
      ],
    );
    const row = rows[0];
    if (!row) {
      throw new InternalServerErrorException('PROMO_CODE_NOT_CREATED');
    }
    return this.toPromoResponse(row);
  }

  /**
   * Conciliación (CONTRACTS.md §3.2, solo lectura):
   * - Cada cuenta: `available + reserved` almacenado == suma firmada de
   *   sus asientos (usuario: DEBIT − CREDIT; sistema: CREDIT − DEBIT).
   * - Cada transacción: Σ DEBIT == Σ CREDIT.
   * - Circulación global: Σ usuarios == MINT + PROMO.
   * No modifica nada; las discrepancias se reportan, no se corrigen
   * editando el ledger (eso exige un REVERSAL autorizado).
   */
  async reconcile(): Promise<ReconcileResult> {
    const { rows: wallets } = await this.db.query<{
      id: string;
      user_id: string;
      available_balance: number;
      reserved_balance: number;
    }>(
      'SELECT id, user_id, available_balance, reserved_balance FROM wallet_accounts ORDER BY created_at ASC',
    );
    const { rows: systems } = await this.db.query<{
      id: string;
      code: string;
      available_balance: number;
      reserved_balance: number;
    }>(
      'SELECT id, code, available_balance, reserved_balance FROM system_accounts ORDER BY code ASC',
    );
    const { rows: signed } = await this.db.query<{
      account_type: string;
      account_id: string;
      signed_total: string;
    }>(
      "SELECT account_type, account_id, SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END)::bigint AS signed_total FROM ledger_entries GROUP BY account_type, account_id",
    );
    const signedByKey = new Map<string, number>();
    for (const row of signed) {
      signedByKey.set(`${row.account_type}:${row.account_id}`, Number(row.signed_total));
    }
    const discrepancies: ReconcileResult['discrepancies'] = [];
    let usersTotal = 0;
    for (const w of wallets) {
      const stored = w.available_balance + w.reserved_balance;
      usersTotal += stored;
      const ledgerTotal = signedByKey.get(`USER:${w.id}`) ?? 0;
      if (stored !== ledgerTotal) {
        discrepancies.push({
          accountType: 'USER',
          accountId: w.id,
          userId: w.user_id,
          storedTotal: stored,
          ledgerTotal,
          ok: false,
        });
      }
    }
    let systemTotal = 0;
    for (const s of systems) {
      const stored = s.available_balance + s.reserved_balance;
      // Solo MINT y PROMO forman parte de la circulación (ESCROW/HOUSE 0).
      if (s.code === 'MINT' || s.code === 'PROMO') {
        systemTotal += stored;
      }
      // Sistema: CREDIT suma, DEBIT resta -> -(DEBIT - CREDIT).
      const ledgerTotal = -(signedByKey.get(`SYSTEM:${s.id}`) ?? 0);
      if (stored !== ledgerTotal) {
        discrepancies.push({
          accountType: 'SYSTEM',
          accountId: s.id,
          code: s.code,
          storedTotal: stored,
          ledgerTotal,
          ok: false,
        });
      }
    }
    const { rows: unbalanced } = await this.db.query<{
      transaction_id: string;
      diff: string;
    }>(
      "SELECT transaction_id, SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END)::bigint AS diff FROM ledger_entries GROUP BY transaction_id HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) <> 0",
    );
    const unbalancedTransactions = unbalanced.map((r) => ({
      transactionId: r.transaction_id,
      diff: Number(r.diff),
    }));
    const circulationOk = usersTotal === systemTotal;
    const ok =
      discrepancies.length === 0 && unbalancedTransactions.length === 0 && circulationOk;
    return {
      checkedAt: new Date().toISOString(),
      ok,
      accountsChecked: wallets.length + systems.length,
      discrepancies,
      unbalancedTransactions,
      circulation: { usersTotal, systemTotal, ok: circulationOk },
      currency: CURRENCY,
      demo: DEMO,
    };
  }

  // ------------------------------------------------------------------
  // Motor genérico de operaciones de un usuario
  // ------------------------------------------------------------------

  private async runUserOperation(
    client: PoolClient,
    opts: {
      userId: string;
      type: WalletTransactionType;
      amount: number;
      idempotencyKey: string;
      description: string;
      referenceType: string;
      referenceId: string | null;
      apply: (ctx: { wallet: WalletAccountRow }) => Promise<{
        legs: LedgerLeg[];
        balanceAfter: Map<string, number>;
      }>;
    },
  ): Promise<TransactionResponse> {
    await this.loadUserRole(client, opts.userId, ['USER', 'ADMIN']);
    const replay = await this.findTxByKey(client, opts.idempotencyKey);
    if (replay) {
      const ownerWalletId = await this.loadWalletId(client, opts.userId);
      return this.replayOrConflict(replay, opts.userId, opts.type, opts.amount, ownerWalletId);
    }
    const wallet = await this.loadWalletForUpdate(client, opts.userId);
    const { legs, balanceAfter } = await opts.apply({ wallet });
    const tx = await this.insertTransaction(client, {
      idempotencyKey: opts.idempotencyKey,
      type: opts.type,
      userId: opts.userId,
      referenceType: opts.referenceType,
      referenceId: opts.referenceId,
      description: opts.description,
      metadata: { amount: opts.amount, legs },
    });
    await this.insertEntries(client, tx.id, legs, balanceAfter);
    const entries = await this.loadEntries(client, tx.id);
    return this.toTransactionResponse(tx, entries, wallet.id);
  }

  private replayOrConflict(
    existing: { tx: WalletTransactionRow; entries: LedgerEntryRow[] },
    userId: string,
    type: WalletTransactionType,
    amount: number,
    ownerWalletId?: string | null,
  ): TransactionResponse {
    if (
      existing.tx.user_id !== userId ||
      existing.tx.type !== type ||
      Number(existing.tx.metadata?.amount) !== amount
    ) {
      throw new ConflictException('IDEMPOTENCY_KEY_CONFLICT');
    }
    return this.toTransactionResponse(existing.tx, existing.entries, ownerWalletId);
  }

  // ------------------------------------------------------------------
  // Acceso a datos
  // ------------------------------------------------------------------

  private async loadUserRole(
    executor: DbExecutor,
    userId: string,
    allowed: Role[],
  ): Promise<{ id: string; role: Role }> {
    const { rows } = await executor.query(
      'SELECT id, role, status FROM users WHERE id = $1',
      [userId],
    );
    const user = rows[0] as { id: string; role: string; status: string } | undefined;
    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }
    const role = user.role as Role;
    if (role === 'GUEST' || !allowed.includes(role)) {
      throw new ForbiddenException(
        role === 'GUEST' ? 'GUEST_WALLET_NOT_ALLOWED' : 'ROLE_NOT_ALLOWED',
      );
    }
    return { id: user.id, role };
  }

  private async loadWalletForUpdate(
    client: PoolClient,
    userId: string,
  ): Promise<WalletAccountRow> {
    const wallet = await this.findWalletForUpdate(client, userId);
    if (!wallet) {
      throw new NotFoundException('WALLET_NOT_FOUND');
    }
    return wallet;
  }

  private async findWalletForUpdate(
    client: PoolClient,
    userId: string,
  ): Promise<WalletAccountRow | null> {
    const { rows } = await client.query<WalletAccountRow>(
      'SELECT id, user_id, available_balance, reserved_balance, version FROM wallet_accounts WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    return rows[0] ?? null;
  }

  /** Id de la billetera de un usuario (lectura, sin bloqueo). */
  private async loadWalletId(
    executor: DbExecutor,
    userId: string,
  ): Promise<string | null> {
    const { rows } = await executor.query(
      'SELECT id FROM wallet_accounts WHERE user_id = $1',
      [userId],
    );
    return (rows[0] as { id: string } | undefined)?.id ?? null;
  }

  private async insertWallet(
    client: PoolClient,
    userId: string,
  ): Promise<WalletAccountRow> {
    const { rows } = await client.query<WalletAccountRow>(
      "INSERT INTO wallet_accounts (user_id, currency, available_balance, reserved_balance) VALUES ($1, 'CREDITO', 0, 0) RETURNING id, user_id, available_balance, reserved_balance, version",
      [userId],
    );
    const wallet = rows[0];
    if (!wallet) {
      throw new InternalServerErrorException('WALLET_NOT_CREATED');
    }
    return wallet;
  }

  private async loadWalletByIdForUpdate(
    client: PoolClient,
    accountId: string,
  ): Promise<WalletAccountRow | null> {
    const { rows } = await client.query<WalletAccountRow>(
      'SELECT id, user_id, available_balance, reserved_balance, version FROM wallet_accounts WHERE id = $1 FOR UPDATE',
      [accountId],
    );
    return rows[0] ?? null;
  }

  private async loadSystemForUpdate(
    client: PoolClient,
    code: SystemAccountCode,
  ): Promise<SystemAccountRow> {
    const { rows } = await client.query<SystemAccountRow>(
      'SELECT id, code, available_balance, reserved_balance, version FROM system_accounts WHERE code = $1 FOR UPDATE',
      [code],
    );
    const account = rows[0];
    if (!account) {
      throw new InternalServerErrorException('SYSTEM_ACCOUNT_MISSING');
    }
    return account;
  }

  private async loadSystemByIdForUpdate(
    client: PoolClient,
    accountId: string,
  ): Promise<SystemAccountRow | null> {
    const { rows } = await client.query<SystemAccountRow>(
      'SELECT id, code, available_balance, reserved_balance, version FROM system_accounts WHERE id = $1 FOR UPDATE',
      [accountId],
    );
    return rows[0] ?? null;
  }

  private async loadPromoForUpdate(
    client: PoolClient,
    code: string,
  ): Promise<PromoCodeRow | null> {
    const { rows } = await client.query<PromoCodeRow>(
      'SELECT id, code, credits, max_uses, used_count, expires_at, active, created_by, created_at FROM promo_codes WHERE code = $1 FOR UPDATE',
      [code],
    );
    return rows[0] ?? null;
  }

  private async updateWallet(
    client: PoolClient,
    account: WalletAccountRow,
    available: number,
    reserved: number,
  ): Promise<void> {
    if (available < 0 || reserved < 0) {
      throw new BadRequestException('INSUFFICIENT_CREDITS');
    }
    const { rowCount } = await client.query(
      'UPDATE wallet_accounts SET available_balance = $1, reserved_balance = $2, version = version + 1 WHERE id = $3 AND version = $4',
      [available, reserved, account.id, account.version],
    );
    if (rowCount !== 1) {
      throw new ConflictException('CONCURRENT_MODIFICATION');
    }
  }

  private async updateSystem(
    client: PoolClient,
    account: SystemAccountRow,
    available: number,
  ): Promise<void> {
    if (available < 0) {
      throw new BadRequestException('INSUFFICIENT_CREDITS');
    }
    const { rowCount } = await client.query(
      'UPDATE system_accounts SET available_balance = $1, reserved_balance = $2, version = version + 1 WHERE id = $3 AND version = $4',
      [available, account.reserved_balance, account.id, account.version],
    );
    if (rowCount !== 1) {
      throw new ConflictException('CONCURRENT_MODIFICATION');
    }
  }

  private async dailyDepositTotal(client: PoolClient, userId: string): Promise<number> {
    const { rows } = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(le.amount), 0)::bigint AS total
       FROM wallet_transactions wt
       JOIN ledger_entries le ON le.transaction_id = wt.id
       WHERE wt.user_id = $1 AND wt.type = 'DEPOSIT' AND wt.status = 'COMPLETED'
         AND le.account_type = 'USER' AND le.direction = 'DEBIT'
         AND wt.created_at >= date_trunc('day', now())`,
      [userId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  private async findTxByKey(
    client: PoolClient,
    key: string,
  ): Promise<{ tx: WalletTransactionRow; entries: LedgerEntryRow[] } | null> {
    const { rows } = await client.query<WalletTransactionRow>(
      `SELECT ${TX_COLUMNS} FROM wallet_transactions WHERE idempotency_key = $1`,
      [key],
    );
    const tx = rows[0];
    if (!tx) return null;
    const entries = await this.loadEntries(client, tx.id);
    return { tx, entries };
  }

  private async findTxById(
    client: PoolClient,
    id: string,
  ): Promise<WalletTransactionRow | null> {
    const { rows } = await client.query<WalletTransactionRow>(
      `SELECT ${TX_COLUMNS} FROM wallet_transactions WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  private async insertTransaction(
    client: PoolClient,
    fields: {
      idempotencyKey: string;
      type: WalletTransactionType;
      userId: string;
      referenceType: string;
      referenceId: string | null;
      description: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<WalletTransactionRow> {
    try {
      const { rows } = await client.query<WalletTransactionRow>(
        `INSERT INTO wallet_transactions (idempotency_key, type, status, user_id, reference_type, reference_id, description, metadata, completed_at) VALUES ($1, $2, 'COMPLETED', $3, $4, $5, $6, $7, now()) RETURNING ${TX_COLUMNS}`,
        [
          fields.idempotencyKey,
          fields.type,
          fields.userId,
          fields.referenceType,
          fields.referenceId,
          fields.description,
          JSON.stringify(fields.metadata),
        ],
      );
      const tx = rows[0];
      if (!tx) {
        throw new InternalServerErrorException('TRANSACTION_NOT_CREATED');
      }
      return tx;
    } catch (err: any) {
      // Carrera por la misma clave: la restricción UNIQUE la detecta;
      // la transacción revierte y el llamante reintenta (la repetición
      // con la misma clave devolverá la original).
      if (err?.code === '23505') {
        throw new ConflictException('IDEMPOTENCY_KEY_CONFLICT');
      }
      throw err;
    }
  }

  private async insertEntries(
    client: PoolClient,
    transactionId: string,
    legs: LedgerLeg[],
    balanceAfter: Map<string, number>,
  ): Promise<void> {
    for (const leg of legs) {
      const after = balanceAfter.get(leg.accountId);
      if (after === undefined) {
        throw new InternalServerErrorException('BALANCE_AFTER_MISSING');
      }
      await client.query(
        'INSERT INTO ledger_entries (transaction_id, account_type, account_id, direction, amount, balance_after) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [transactionId, leg.accountType, leg.accountId, leg.direction, leg.amount, after],
      );
    }
  }

  private async loadEntries(
    executor: DbExecutor,
    transactionId: string,
  ): Promise<LedgerEntryRow[]> {
    const { rows } = await executor.query(
      'SELECT id, transaction_id, account_type, account_id, direction, amount, balance_after, created_at FROM ledger_entries WHERE transaction_id = $1 ORDER BY id ASC',
      [transactionId],
    );
    return rows as LedgerEntryRow[];
  }

  // ------------------------------------------------------------------
  // Presentación
  // ------------------------------------------------------------------

  private leg(
    kind: LegKind,
    accountType: 'USER' | 'SYSTEM',
    accountId: string,
    direction: LedgerDirection,
    amount: number,
  ): LedgerLeg {
    return { kind, accountType, accountId, direction, amount };
  }

  private toWalletResponse(account: WalletAccountRow): WalletResponse {
    return {
      available: account.available_balance,
      reserved: account.reserved_balance,
      total: account.available_balance + account.reserved_balance,
      currency: CURRENCY,
      demo: DEMO,
    };
  }

  private toTransactionResponse(
    tx: WalletTransactionRow,
    entries: LedgerEntryRow[],
    /**
     * Id de la cuenta (billetera) del dueño de la transacción. OBLIGATORIO
     * para calcular bien `direction` y `balanceAfter`: un WIN_PAYOUT
     * tiene asientos de DOS billeteras (la del perdedor resta y la del
     * ganador suma) y antes se sumaban todos los asientos USER, con neto
     * 0 (NEUTRAL) y `balanceAfter` de la primera entrada (la del
     * perdedor). Con el id, el neto y el saldo son los del dueño.
     * Si no se pasa, se mantiene el comportamiento anterior (todas las
     * entradas USER): solo ocurre en transacciones de una sola billetera,
     * donde ambos cálculos coinciden.
     */
    ownerWalletId?: string | null,
  ): TransactionResponse {
    const metadata =
      typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : (tx.metadata ?? {});
    // Sentido para el usuario (ver TransactionResponse.direction): el
    // efecto neto de los asientos de la cuenta del usuario sobre su
    // saldo total. En el ledger, DEBIT suma y CREDIT resta en la cuenta
    // del usuario; un BET_HOLD/BET_RELEASE mueve available <-> reserved
    // y su neto es 0 (NEUTRAL).
    const userEntries = entries.filter((e) => e.account_type === 'USER');
    const ownEntries =
      ownerWalletId != null
        ? userEntries.filter((e) => e.account_id === ownerWalletId)
        : userEntries;
    // Si se pidió una billetera concreta y no tiene asientos (no debería
    // pasar), se usa el cálculo anterior en vez de dejar saldo 0.
    const scoped = ownEntries.length > 0 ? ownEntries : userEntries;
    const net = scoped.reduce(
      (acc, e) => acc + (e.direction === 'DEBIT' ? Number(e.amount) : -Number(e.amount)),
      0,
    );
    const direction: 'CREDIT' | 'DEBIT' | 'NEUTRAL' =
      net > 0 ? 'CREDIT' : net < 0 ? 'DEBIT' : 'NEUTRAL';
    const userEntry = scoped[0];
    return {
      id: tx.id,
      idempotencyKey: tx.idempotency_key,
      type: tx.type,
      status: tx.status,
      userId: tx.user_id,
      referenceType: tx.reference_type,
      referenceId: tx.reference_id,
      description: tx.description,
      amount: Number(metadata.amount ?? 0),
      direction,
      balanceAfter: userEntry ? Number(userEntry.balance_after) : 0,
      currency: CURRENCY,
      demo: DEMO,
      createdAt: new Date(tx.created_at).toISOString(),
      completedAt: tx.completed_at ? new Date(tx.completed_at).toISOString() : null,
      entries: entries.map((e) => this.toEntryResponse(e)),
    };
  }

  private toEntryResponse(e: LedgerEntryRow): LedgerEntryResponse {
    return {
      id: Number(e.id),
      transactionId: e.transaction_id,
      accountType: e.account_type,
      accountId: e.account_id,
      direction: e.direction,
      amount: Number(e.amount),
      balanceAfter: Number(e.balance_after),
      createdAt: new Date(e.created_at).toISOString(),
    };
  }

  private toPromoResponse(row: PromoCodeRow): PromoCodeResponse {
    return {
      id: row.id,
      code: row.code,
      credits: Number(row.credits),
      maxUses: row.max_uses,
      usedCount: row.used_count,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      active: row.active,
      createdAt: new Date(row.created_at).toISOString(),
      currency: CURRENCY,
      demo: DEMO,
    };
  }

  private assertPositiveInt(value: number, name: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${name.toUpperCase()}_MUST_BE_POSITIVE_INTEGER`);
    }
  }
}

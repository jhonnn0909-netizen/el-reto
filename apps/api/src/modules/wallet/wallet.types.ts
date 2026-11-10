/**
 * Tipos y constantes del módulo de billetera DEMO/SANDBOX.
 *
 * CONTRATO: CONTRACTS.md §3.2, §4.3 y §9.2.
 * - Moneda única `CREDITO`, entero sin decimales, créditos EXCLUSIVAMENTE
 *   virtuales (demo, sin valor real, sin dinero real, sin pagos reales).
 * - Toda respuesta de billetera lleva `demo: true`.
 * - Ledger inmutable de doble partida: cada transacción tiene al menos
 *   2 asientos y la suma de DEBIT = suma de CREDIT por transacción.
 *
 * CONVENCIÓN DE SIGNOS (CONTRACTS.md §3.2 + doc 03 §11.5):
 * - Cuenta de USUARIO: DEBIT suma (+), CREDIT resta (−).
 *   El saldo conciliado es `available + reserved`.
 * - Cuenta de SISTEMA: CREDIT suma (+), DEBIT resta (−).
 *   (MINT crece al emitir, decrece al "quemar" en retiros simulados;
 *   PROMO crece al conceder promociones; ESCROW/HOUSE quedan en 0 en el MVP.)
 * - `balance_after` de cada asiento es el total de la cuenta
 *   (available + reserved en usuario; available en sistema) DESPUÉS de
 *   aplicar TODA la transacción, no tras cada línea aislada. En los
 *   movimientos internos (BET_HOLD / BET_RELEASE) el total no cambia,
 *   por lo que ambas líneas llevan el mismo `balance_after`.
 *
 * SUB-SALDOS: `ledger_entries` no distingue available/reserved, por lo
 * que cada transacción guarda en `wallet_transactions.metadata.legs` la
 * semántica de cada línea (`user-available` | `user-reserved` | `system`).
 * El reverso invierte esas líneas; sin ellas una transacción no se
 * puede revertir de forma segura.
 *
 * BET_HOLD / BET_RELEASE son movimientos INTERNOS de la cuenta del
 * usuario (available <-> reserved). ESCROW no recibe los fondos en el
 * MVP: moverlos a ESCROW rompería la regla de conciliación de
 * CONTRACTS.md §3.2 (`available + reserved` = suma firmada de los
 * asientos del usuario). ESCROW queda reservado para un diseño futuro
 * de custodia entre cuentas y permanece en 0 (igual que HOUSE).
 */
export const CURRENCY = 'CREDITO' as const;
export const DEMO = true as const;

export type Role = 'USER' | 'ADMIN' | 'GUEST';

export type WalletTransactionType =
  | 'WELCOME_BONUS'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'PROMO_CREDIT'
  | 'BET_HOLD'
  | 'BET_RELEASE'
  | 'WIN_PAYOUT'
  | 'REFUND'
  | 'REVERSAL'
  | 'ADJUSTMENT';

export const WALLET_TRANSACTION_TYPES: WalletTransactionType[] = [
  'WELCOME_BONUS',
  'DEPOSIT',
  'WITHDRAWAL',
  'PROMO_CREDIT',
  'BET_HOLD',
  'BET_RELEASE',
  'WIN_PAYOUT',
  'REFUND',
  'REVERSAL',
  'ADJUSTMENT',
];

export type WalletTransactionStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVERSED';

export type SystemAccountCode = 'MINT' | 'PROMO' | 'ESCROW' | 'HOUSE';

export type LedgerDirection = 'DEBIT' | 'CREDIT';
export type AccountType = 'USER' | 'SYSTEM';

/** Sub-saldo afectado por una línea del ledger (solo en metadata). */
export type LegKind = 'user-available' | 'user-reserved' | 'system';

export interface LedgerLeg {
  kind: LegKind;
  accountType: AccountType;
  /** UUID de wallet_accounts (usuario) o de system_accounts. */
  accountId: string;
  direction: LedgerDirection;
  amount: number;
}

/** Usuario autenticado que dejan los guards en `req.user`. */
export interface AuthUser {
  id: string;
  role: Role;
  status?: string;
}

export interface WalletResponse {
  available: number;
  reserved: number;
  total: number;
  currency: typeof CURRENCY;
  demo: typeof DEMO;
}

export interface LedgerEntryResponse {
  id: number;
  transactionId: string;
  accountType: AccountType;
  accountId: string;
  direction: LedgerDirection;
  amount: number;
  balanceAfter: number;
  createdAt: string;
}

export interface TransactionResponse {
  id: string;
  idempotencyKey: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  userId: string;
  referenceType: string | null;
  referenceId: string | null;
  description: string;
  /** Importe de la operación en créditos (entero). */
  amount: number;
  currency: typeof CURRENCY;
  demo: typeof DEMO;
  createdAt: string;
  completedAt: string | null;
  entries: LedgerEntryResponse[];
}

export interface PaginatedMovements {
  data: TransactionResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ReconcileAccountResult {
  accountType: AccountType;
  accountId: string;
  userId?: string;
  code?: string;
  storedTotal: number;
  ledgerTotal: number;
  ok: boolean;
}

export interface ReconcileResult {
  checkedAt: string;
  ok: boolean;
  accountsChecked: number;
  discrepancies: ReconcileAccountResult[];
  unbalancedTransactions: { transactionId: string; diff: number }[];
  /**
   * Conservación global: la suma de (available + reserved) de todos los
   * usuarios debe ser igual a MINT + PROMO (los créditos en circulación
   * proceden solo de emisión y promociones; ESCROW y HOUSE son 0).
   * Los movimientos internos (BET_HOLD/RELEASE) y entre usuarios
   * (WIN_PAYOUT) no cambian el total en circulación.
   */
  circulation: { usersTotal: number; systemTotal: number; ok: boolean };
  currency: typeof CURRENCY;
  demo: typeof DEMO;
}

export interface PromoCodeResponse {
  id: string;
  code: string;
  credits: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  currency: typeof CURRENCY;
  demo: typeof DEMO;
}

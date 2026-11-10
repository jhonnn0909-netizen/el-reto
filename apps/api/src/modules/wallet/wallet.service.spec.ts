import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { WalletService } from './wallet.service';

/**
 * Pruebas del WalletService con una base de datos en memoria (FakeDb).
 * NO requieren Postgres/Redis ni red: se mockea DatabaseService.
 *
 * El FakeDb serializa las transacciones (cola de promesas), que es el
 * comportamiento que PostgreSQL garantiza con `SELECT ... FOR UPDATE`
 * sobre la misma billetera: las operaciones concurrentes sobre una
 * cuenta se ejecutan en serie y la segunda ve el saldo ya actualizado.
 * Por eso la prueba de doble gasto es una simulación fiel a nivel de
 * servicio, no una prueba de concurrencia real de PostgreSQL (eso
 * corresponde a las pruebas de integración con BD, fuera de este spec).
 */

type Row = Record<string, any>;

class FakeDb {
  users = new Map<string, Row>();
  wallets = new Map<string, Row>();
  systems = new Map<string, Row>();
  txs: Row[] = [];
  entries: Row[] = [];
  promos = new Map<string, Row>();
  redemptions: Row[] = [];
  private seq = 0;
  private txSeq = 0;
  private entrySeq = 0;
  private queue: Promise<unknown> = Promise.resolve();

  seedSystem(code: string) {
    this.systems.set(code, {
      id: `sys-${code.toLowerCase()}`,
      code,
      available_balance: 0,
      reserved_balance: 0,
      version: 0,
      created_at: new Date(),
    });
  }

  seedUser(id: string, role: string) {
    this.users.set(id, { id, role, status: 'ACTIVE' });
  }

  async query(text: string, params: unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
    const rows = this.dispatch(text, params);
    // PostgreSQL devuelve filas nuevas en cada SELECT, nunca referencias
    // vivas a sus datos internos: se clonan para reproducir esa
    // semántica (si no, una actualización posterior mutaría el objeto
    // que el servicio ya había leído, como pasó en `payout`).
    return { rows: JSON.parse(JSON.stringify(rows)), rowCount: this.lastRowCount };
  }

  private lastRowCount = 0;

  async transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => fn(this as any));
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private dispatch(text: string, params: unknown[]): any[] {
    this.lastRowCount = 0;
    const p = (i: number) => params[i];

    // Suma diaria de depósitos (DEPOSIT del día, lado usuario DEBIT).
    if (text.includes("date_trunc('day', now())")) {
      const userId = p(0);
      let total = 0;
      for (const tx of this.txs) {
        if (tx.user_id === userId && tx.type === 'DEPOSIT' && tx.status === 'COMPLETED') {
          for (const e of this.entries) {
            if (e.transaction_id === tx.id && e.account_type === 'USER' && e.direction === 'DEBIT') {
              total += e.amount;
            }
          }
        }
      }
      return [{ total: String(total) }];
    }

    // Conciliación: suma firmada por cuenta.
    if (text.includes('GROUP BY account_type, account_id')) {
      const sums = new Map<string, { account_type: string; account_id: string; signed_total: number }>();
      for (const e of this.entries) {
        const key = `${e.account_type}:${e.account_id}`;
        const cur = sums.get(key) ?? { account_type: e.account_type, account_id: e.account_id, signed_total: 0 };
        cur.signed_total += e.direction === 'DEBIT' ? e.amount : -e.amount;
        sums.set(key, cur);
      }
      return [...sums.values()].map((r) => ({ ...r, signed_total: String(r.signed_total) }));
    }

    // Conciliación: transacciones descuadradas.
    if (text.includes('GROUP BY transaction_id HAVING')) {
      const sums = new Map<string, number>();
      for (const e of this.entries) {
        sums.set(e.transaction_id, (sums.get(e.transaction_id) ?? 0) + (e.direction === 'DEBIT' ? e.amount : -e.amount));
      }
      return [...sums.entries()]
        .filter(([, diff]) => diff !== 0)
        .map(([transaction_id, diff]) => ({ transaction_id, diff: String(diff) }));
    }

    // COUNT de transacciones (listados).
    if (text.includes('COUNT(*)::bigint')) {
      const filtered = this.filterTxs(text, params);
      return [{ total: String(filtered.length) }];
    }

    // Usuario por id.
    if (text.includes('FROM users WHERE id = $1')) {
      const user = this.users.get(String(p(0)));
      return user ? [user] : [];
    }

    // INSERT wallet.
    if (text.includes('INSERT INTO wallet_accounts')) {
      const userId = String(p(0));
      for (const w of this.wallets.values()) {
        if (w.user_id === userId) {
          const err: any = new Error('duplicate key');
          err.code = '23505';
          throw err;
        }
      }
      const row = {
        id: `wallet-${++this.seq}`,
        user_id: userId,
        available_balance: 0,
        reserved_balance: 0,
        version: 0,
        created_at: new Date(),
      };
      this.wallets.set(row.id, row);
      this.lastRowCount = 1;
      return [row];
    }

    // Wallet por usuario.
    if (text.includes('FROM wallet_accounts WHERE user_id = $1')) {
      for (const w of this.wallets.values()) {
        if (w.user_id === String(p(0))) return [w];
      }
      return [];
    }

    // Wallet por id.
    if (text.includes('FROM wallet_accounts WHERE id = $1')) {
      const w = this.wallets.get(String(p(0)));
      return w ? [w] : [];
    }

    // UPDATE wallet (version optimista).
    if (text.includes('UPDATE wallet_accounts SET')) {
      const w = this.wallets.get(String(p(2)));
      if (w && w.version === p(3)) {
        w.available_balance = p(0);
        w.reserved_balance = p(1);
        w.version += 1;
        this.lastRowCount = 1;
      }
      return [];
    }

    // INSERT transacción.
    if (text.includes('INSERT INTO wallet_transactions')) {
      const key = String(p(0));
      if (this.txs.some((t) => t.idempotency_key === key)) {
        const err: any = new Error('duplicate key');
        err.code = '23505';
        throw err;
      }
      const row = {
        id: `tx-${++this.txSeq}`,
        idempotency_key: key,
        type: p(1),
        status: 'COMPLETED',
        user_id: p(2),
        reference_type: p(3),
        reference_id: p(4),
        description: p(5),
        metadata: JSON.parse(String(p(6))),
        created_at: new Date(),
        completed_at: new Date(),
        _seq: this.txSeq,
      };
      this.txs.push(row);
      this.lastRowCount = 1;
      return [row];
    }

    // Transacción por clave de idempotencia.
    if (text.includes('FROM wallet_transactions WHERE idempotency_key = $1')) {
      const tx = this.txs.find((t) => t.idempotency_key === String(p(0)));
      return tx ? [tx] : [];
    }

    // Transacción por id.
    if (text.includes('FROM wallet_transactions WHERE id = $1')) {
      const tx = this.txs.find((t) => t.id === String(p(0)));
      return tx ? [tx] : [];
    }

    // UPDATE status de transacción.
    if (text.includes('UPDATE wallet_transactions SET status')) {
      const tx = this.txs.find((t) => t.id === String(p(1)) && t.status === String(p(2)));
      if (tx) {
        tx.status = p(0);
        this.lastRowCount = 1;
      }
      return [];
    }

    // Listado de transacciones (usuario o admin).
    if (text.includes('FROM wallet_transactions') && text.includes('ORDER BY created_at DESC')) {
      const filtered = this.filterTxs(text, params);
      filtered.sort((a, b) => b._seq - a._seq);
      const limitMatch = text.match(/LIMIT \$(\d+)/);
      const offsetMatch = text.match(/OFFSET \$(\d+)/);
      const limit = limitMatch ? Number(params[Number(limitMatch[1]) - 1]) : filtered.length;
      const offset = offsetMatch ? Number(params[Number(offsetMatch[1]) - 1]) : 0;
      return filtered.slice(offset, offset + limit);
    }

    // INSERT asiento de ledger.
    if (text.includes('INSERT INTO ledger_entries')) {
      const row = {
        id: ++this.entrySeq,
        transaction_id: p(0),
        account_type: p(1),
        account_id: p(2),
        direction: p(3),
        amount: p(4),
        balance_after: p(5),
        created_at: new Date(),
      };
      this.entries.push(row);
      this.lastRowCount = 1;
      return [row];
    }

    // Asientos de una transacción.
    if (text.includes('FROM ledger_entries WHERE transaction_id = $1')) {
      return this.entries
        .filter((e) => e.transaction_id === String(p(0)))
        .sort((a, b) => a.id - b.id);
    }

    // Cuenta de sistema por código.
    if (text.includes('FROM system_accounts WHERE code = $1')) {
      const s = this.systems.get(String(p(0)));
      return s ? [s] : [];
    }

    // Cuenta de sistema por id.
    if (text.includes('FROM system_accounts WHERE id = $1')) {
      for (const s of this.systems.values()) {
        if (s.id === String(p(0))) return [s];
      }
      return [];
    }

    // UPDATE cuenta de sistema.
    if (text.includes('UPDATE system_accounts SET')) {
      for (const s of this.systems.values()) {
        if (s.id === String(p(2)) && s.version === p(3)) {
          s.available_balance = p(0);
          s.reserved_balance = p(1);
          s.version += 1;
          this.lastRowCount = 1;
        }
      }
      return [];
    }

    // Promo por código.
    if (text.includes('FROM promo_codes WHERE code = $1')) {
      const promo = this.promos.get(String(p(0)));
      return promo ? [promo] : [];
    }

    // UPDATE used_count de promo.
    if (text.includes('UPDATE promo_codes SET used_count')) {
      for (const promo of this.promos.values()) {
        if (promo.id === String(p(0)) && promo.used_count < promo.max_uses) {
          promo.used_count += 1;
          this.lastRowCount = 1;
        }
      }
      return [];
    }

    // INSERT promo.
    if (text.includes('INSERT INTO promo_codes')) {
      const code = String(p(0));
      if (this.promos.has(code)) {
        const err: any = new Error('duplicate key');
        err.code = '23505';
        throw err;
      }
      const row = {
        id: `promo-${++this.seq}`,
        code,
        credits: p(1),
        max_uses: p(2),
        used_count: 0,
        expires_at: p(3),
        active: p(4),
        created_by: p(5),
        created_at: new Date(),
      };
      this.promos.set(code, row);
      this.lastRowCount = 1;
      return [row];
    }

    // Canje existente.
    if (text.includes('FROM promo_redemptions WHERE promo_code_id')) {
      return this.redemptions.filter(
        (r) => r.promo_code_id === String(p(0)) && r.user_id === String(p(1)),
      );
    }

    // INSERT canje.
    if (text.includes('INSERT INTO promo_redemptions')) {
      if (
        this.redemptions.some(
          (r) => r.promo_code_id === String(p(0)) && r.user_id === String(p(1)),
        )
      ) {
        const err: any = new Error('duplicate key');
        err.code = '23505';
        throw err;
      }
      const row = { id: `red-${++this.seq}`, promo_code_id: p(0), user_id: p(1), transaction_id: p(2), created_at: new Date() };
      this.redemptions.push(row);
      this.lastRowCount = 1;
      return [row];
    }

    // Conciliación: todas las wallets.
    if (text.includes('FROM wallet_accounts ORDER BY')) {
      return [...this.wallets.values()].sort((a, b) => a.id.localeCompare(b.id));
    }

    // Conciliación: todas las cuentas de sistema.
    if (text.includes('FROM system_accounts ORDER BY')) {
      return [...this.systems.values()].sort((a, b) => a.code.localeCompare(b.code));
    }

    throw new Error(`FakeDb: SQL no soportado en el spec: ${text.slice(0, 120)}`);
  }

  private filterTxs(text: string, params: unknown[]): Row[] {
    const getParam = (field: string): unknown => {
      const m = text.match(new RegExp(`${field} = \\$(\\d+)`));
      return m ? params[Number(m[1]) - 1] : undefined;
    };
    const userId = getParam('user_id');
    const type = getParam('type');
    const status = getParam('status');
    return this.txs.filter(
      (t) =>
        (userId === undefined || t.user_id === userId) &&
        (type === undefined || t.type === type) &&
        (status === undefined || t.status === status),
    );
  }
}

describe('WalletService', () => {
  let fake: FakeDb;
  let service: WalletService;

  const USER_1 = 'user-1';
  const USER_2 = 'user-2';
  const ADMIN_1 = 'admin-1';
  const GUEST_1 = 'guest-1';

  beforeEach(async () => {
    fake = new FakeDb();
    for (const code of ['MINT', 'PROMO', 'ESCROW', 'HOUSE']) fake.seedSystem(code);
    fake.seedUser(USER_1, 'USER');
    fake.seedUser(USER_2, 'USER');
    fake.seedUser(ADMIN_1, 'ADMIN');
    fake.seedUser(GUEST_1, 'GUEST');
    const config = {
      get: (key: string, def: unknown) => {
        const values: Record<string, number> = {
          'demo.welcomeCredits': 1000,
          'demo.dailyDepositLimit': 10000,
          'demo.maxStake': 1000,
        };
        return values[key] ?? def;
      },
    };
    service = new WalletService(
      fake as unknown as DatabaseService,
      config as unknown as ConfigService,
    );
    // Bono de bienvenida para los dos usuarios (saldo inicial 1000).
    await service.grantWelcomeBonus(USER_1);
    await service.grantWelcomeBonus(USER_2);
  });

  async function balance(userId: string) {
    return service.getWallet(userId);
  }

  it('otorga el bono de bienvenida una sola vez (idempotente)', async () => {
    const first = await service.grantWelcomeBonus(USER_1);
    const second = await service.grantWelcomeBonus(USER_1);
    expect(first?.id).toBe(second?.id);
    const wallet = await balance(USER_1);
    expect(wallet.available).toBe(1000);
    expect(wallet.currency).toBe('CREDITO');
    expect(wallet.demo).toBe(true);
  });

  it('depósito idempotente: misma clave = una sola operación', async () => {
    const first = await service.deposit(USER_1, 500, 'dep-clave-1');
    const second = await service.deposit(USER_1, 500, 'dep-clave-1');
    expect(second.id).toBe(first.id);
    expect(second.entries).toHaveLength(2);
    const wallet = await balance(USER_1);
    expect(wallet.available).toBe(1500);
    // La suma DEBIT de asientos del usuario coincide con el saldo.
    const reconcile = await service.reconcile();
    expect(reconcile.ok).toBe(true);
  });

  it('misma clave con distinto importe = conflicto 409', async () => {
    await service.deposit(USER_1, 500, 'dep-clave-2');
    await expect(service.deposit(USER_1, 600, 'dep-clave-2')).rejects.toMatchObject({
      message: 'IDEMPOTENCY_KEY_CONFLICT',
    });
  });

  it('retiro con saldo insuficiente no crea asientos', async () => {
    const before = fake.txs.length;
    await expect(service.withdraw(USER_1, 1001, 'ret-clave-1')).rejects.toMatchObject({
      message: 'INSUFFICIENT_CREDITS',
    });
    expect(fake.txs.length).toBe(before);
    const wallet = await balance(USER_1);
    expect(wallet.available).toBe(1000);
  });

  it('doble gasto concurrente simulado: solo una de dos retiradas pasa', async () => {
    const results = await Promise.allSettled([
      service.withdraw(USER_1, 800, 'ret-conc-1'),
      service.withdraw(USER_1, 800, 'ret-conc-2'),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason.message).toBe('INSUFFICIENT_CREDITS');
    const wallet = await balance(USER_1);
    expect(wallet.available).toBe(200);
    expect(wallet.available).toBeGreaterThanOrEqual(0);
  });

  it('límite de depósito diario: 10000 exactos pasan, 1 más no', async () => {
    await service.deposit(USER_1, 6000, 'dep-dia-1');
    await service.deposit(USER_1, 4000, 'dep-dia-2');
    await expect(service.deposit(USER_1, 1, 'dep-dia-3')).rejects.toMatchObject({
      message: 'DAILY_DEPOSIT_LIMIT_EXCEEDED',
    });
    const wallet = await balance(USER_1);
    expect(wallet.available).toBe(11000);
  });

  it('reverso compensatorio: el original queda intacto y el saldo vuelve', async () => {
    const deposit = await service.deposit(USER_1, 500, 'dep-rev-1');
    const reversal = await service.reverseTransaction(ADMIN_1, deposit.id, 'Depósito duplicado por error');
    expect(reversal.type).toBe('REVERSAL');
    expect(reversal.amount).toBe(500);
    // El asiento original sigue existiendo, con sus 2 líneas intactas.
    const originalEntries = fake.entries.filter((e) => e.transaction_id === deposit.id);
    expect(originalEntries).toHaveLength(2);
    // El reverso tiene sus propias 2 líneas invertidas.
    const reversalEntries = fake.entries.filter((e) => e.transaction_id === reversal.id);
    expect(reversalEntries).toHaveLength(2);
    expect(reversalEntries.map((e) => e.direction).sort()).toEqual(['CREDIT', 'DEBIT']);
    // El saldo vuelve al inicial y la conciliación cuadra.
    const wallet = await balance(USER_1);
    expect(wallet.available).toBe(1000);
    const reconcile = await service.reconcile();
    expect(reconcile.ok).toBe(true);
    // Segundo reverso con la misma clave devuelve el mismo reverso.
    const again = await service.reverseTransaction(ADMIN_1, deposit.id, 'Depósito duplicado por error');
    expect(again.id).toBe(reversal.id);
  });

  it('reverso de un depósito ya gastado falla sin escribir nada', async () => {
    const deposit = await service.deposit(USER_1, 500, 'dep-rev-2');
    await service.withdraw(USER_1, 1500, 'ret-rev-1');
    const txCount = fake.txs.length;
    await expect(
      service.reverseTransaction(ADMIN_1, deposit.id, 'Ya se gastó'),
    ).rejects.toMatchObject({ message: 'INSUFFICIENT_CREDITS' });
    expect(fake.txs.length).toBe(txCount);
  });

  it('conciliación detecta un saldo almacenado manipulado', async () => {
    await service.deposit(USER_1, 200, 'dep-conc-1');
    const reconcileOk = await service.reconcile();
    expect(reconcileOk.ok).toBe(true);
    // Manipulación directa del saldo almacenado (sin asiento).
    const wallet = [...fake.wallets.values()].find((w) => w.user_id === USER_1);
    expect(wallet).toBeDefined();
    wallet!.available_balance += 5;
    const reconcileBad = await service.reconcile();
    expect(reconcileBad.ok).toBe(false);
    expect(reconcileBad.discrepancies).toHaveLength(1);
    expect(reconcileBad.discrepancies[0].userId).toBe(USER_1);
    expect(reconcileBad.discrepancies[0].storedTotal).toBe(1205);
    expect(reconcileBad.discrepancies[0].ledgerTotal).toBe(1200);
  });

  it('canje de promo una sola vez por usuario y con tope de usos', async () => {
    await service.createPromoCode(ADMIN_1, {
      code: 'bienvenida',
      credits: 250,
      maxUses: 1,
    } as any);
    const first = await service.redeemPromo(USER_1, 'bienvenida');
    expect(first.type).toBe('PROMO_CREDIT');
    expect(first.amount).toBe(250);
    const second = await service.redeemPromo(USER_1, 'BIENVENIDA');
    expect(second.id).toBe(first.id);
    const wallet = await balance(USER_1);
    expect(wallet.available).toBe(1250);
    await expect(service.redeemPromo(USER_2, 'bienvenida')).rejects.toMatchObject({
      message: 'PROMO_MAX_USES_REACHED',
    });
  });

  it('invitado bloqueado en todas las operaciones (403)', async () => {
    await expect(service.getWallet(GUEST_1)).rejects.toMatchObject({
      message: 'GUEST_WALLET_NOT_ALLOWED',
    });
    await expect(service.deposit(GUEST_1, 100, 'dep-guest-1')).rejects.toMatchObject({
      message: 'GUEST_WALLET_NOT_ALLOWED',
    });
    await expect(service.withdraw(GUEST_1, 100, 'ret-guest-1')).rejects.toMatchObject({
      message: 'GUEST_WALLET_NOT_ALLOWED',
    });
    await expect(service.redeemPromo(GUEST_1, 'X')).rejects.toMatchObject({
      message: 'GUEST_WALLET_NOT_ALLOWED',
    });
    await expect(service.grantWelcomeBonus(GUEST_1)).rejects.toMatchObject({
      message: 'GUEST_WALLET_NOT_ALLOWED',
    });
    await expect(service.holdStake(GUEST_1, 'match-1', 100)).rejects.toMatchObject({
      message: 'GUEST_WALLET_NOT_ALLOWED',
    });
  });

  it('hold / release / payout mueven la apuesta sin crear ni destruir saldo', async () => {
    await service.holdStake(USER_1, 'match-1', 300);
    await service.holdStake(USER_2, 'match-1', 300);
    let w1 = await balance(USER_1);
    expect(w1.available).toBe(700);
    expect(w1.reserved).toBe(300);
    const [release, payout] = await service.payout('match-1', USER_1, USER_2, 300);
    expect(release.type).toBe('BET_RELEASE');
    expect(payout.type).toBe('WIN_PAYOUT');
    w1 = await balance(USER_1);
    const w2 = await balance(USER_2);
    expect(w1.available).toBe(1300);
    expect(w1.reserved).toBe(0);
    expect(w2.available).toBe(700);
    expect(w2.reserved).toBe(0);
    const reconcile = await service.reconcile();
    expect(reconcile.ok).toBe(true);
    expect(reconcile.circulation.usersTotal).toBe(2000);
    expect(reconcile.circulation.systemTotal).toBe(2000);
  });

  it('hold con saldo insuficiente y apuesta sobre el máximo se rechazan', async () => {
    await expect(service.holdStake(USER_1, 'match-2', 1001)).rejects.toMatchObject({
      message: 'STAKE_EXCEEDS_MAX',
    });
    await service.holdStake(USER_1, 'match-2', 600);
    await expect(service.holdStake(USER_1, 'match-3', 500)).rejects.toMatchObject({
      message: 'INSUFFICIENT_CREDITS',
    });
  });

  it('release de una reserva inexistente se rechaza', async () => {
    await expect(service.releaseStake(USER_1, 'match-3', 100)).rejects.toMatchObject({
      message: 'INSUFFICIENT_CREDITS',
    });
  });

  it('movements pagina y muestra los asientos con demo:true', async () => {
    await service.deposit(USER_1, 100, 'dep-mov-1');
    await service.deposit(USER_1, 200, 'dep-mov-2');
    await service.withdraw(USER_1, 50, 'ret-mov-1');
    const page1 = await service.listMovements(USER_1, { page: 1, limit: 2 } as any);
    expect(page1.total).toBe(4); // bienvenida + 2 depósitos + 1 retiro
    expect(page1.data).toHaveLength(2);
    expect(page1.totalPages).toBe(2);
    expect(page1.data[0].demo).toBe(true);
    expect(page1.data[0].entries.length).toBeGreaterThanOrEqual(2);
    const page2 = await service.listMovements(USER_1, { page: 2, limit: 2 } as any);
    expect(page2.data).toHaveLength(2);
  });

  it('movements: el sentido es CREDIT para ingresos, DEBIT para retiros y NEUTRAL para reservas', async () => {
    await service.deposit(USER_1, 100, 'dep-dir-1');
    await service.withdraw(USER_1, 50, 'ret-dir-1');
    await service.holdStake(USER_1, 'match-dir-1', 100);
    const all = await service.listMovements(USER_1, { page: 1, limit: 10 } as any);
    const byType = new Map(all.data.map((m) => [m.type, m.direction]));
    expect(byType.get('WELCOME_BONUS')).toBe('CREDIT');
    expect(byType.get('DEPOSIT')).toBe('CREDIT');
    expect(byType.get('WITHDRAWAL')).toBe('DEBIT');
    // La reserva mueve available <-> reserved: el saldo total no cambia.
    expect(byType.get('BET_HOLD')).toBe('NEUTRAL');
  });

  it('movements: el WIN_PAYOUT del ganador es CREDIT con su saldo (no NEUTRAL ni el del perdedor)', async () => {
    await service.holdStake(USER_1, 'match-dir-2', 300);
    await service.holdStake(USER_2, 'match-dir-2', 300);
    await service.payout('match-dir-2', USER_1, USER_2, 300);
    const all = await service.listMovements(USER_1, { page: 1, limit: 10 } as any);
    const byType = new Map(all.data.map((m) => [m.type, m]));
    // El ganador recupera su apuesta (total 1000, NEUTRAL) y cobra el
    // premio del perdedor (+300, CREDIT) con saldo resultante 1300.
    // Antes el WIN_PAYOUT sumaba los asientos de AMBOS jugadores (neto
    // 0 → NEUTRAL) y el saldo era el del perdedor (700).
    expect(byType.get('BET_RELEASE')?.direction).toBe('NEUTRAL');
    expect(byType.get('BET_RELEASE')?.balanceAfter).toBe(1000);
    expect(byType.get('WIN_PAYOUT')?.direction).toBe('CREDIT');
    expect(byType.get('WIN_PAYOUT')?.amount).toBe(300);
    expect(byType.get('WIN_PAYOUT')?.balanceAfter).toBe(1300);
  });

  it('retiro de créditos de origen promocional no deja MINT en negativo', async () => {
    await service.createPromoCode(ADMIN_1, { code: 'promo-500', credits: 500, maxUses: 10 } as any);
    await service.redeemPromo(USER_1, 'promo-500');
    // Saldo 1500 (1000 bienvenida + 500 promo); MINT solo tiene 1000.
    await service.withdraw(USER_1, 1500, 'ret-promo-1');
    const wallet = await balance(USER_1);
    expect(wallet.available).toBe(0);
    const reconcile = await service.reconcile();
    expect(reconcile.ok).toBe(true);
  });
});

// Billetera DEMO (DESIGN.md §8): banner permanente, saldo con etiqueta
// DEMO, depósito y retiro con resumen antes de confirmar, modal de
// confirmación obligatorio en retiro, saldo cero como invitación.
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { walletApi } from '../../lib/auth';
import { apiErrorMessage, useApiData } from '../../lib/useApi';
import { getStoredUser, isGuestUser } from '../../lib/session';
import { formatCredits, formatCreditsDemo, movementSign } from '../../lib/format';
import type { WalletMovement, WalletSummary } from '../../lib/types';
import { DemoBanner, DemoBadge } from '../../components/DemoBadge';
import WalletCard from '../../components/WalletCard';
import Modal from '../../components/Modal';
import Toast from '../../components/Toast';
import EmptyState from '../../components/EmptyState';
import { ListSkeleton } from '../../components/Spinner';
import { Button, Field, PageHeader, SectionTitle, TextInput } from '../../components/ui';

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

export default function WalletPage() {
  const [depositAmount, setDepositAmount] = useState(1000);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<'success' | 'error'>('success');
  const [busy, setBusy] = useState(false);
  const guest = isGuestUser(getStoredUser());

  const wallet = useApiData<WalletSummary>(
    () => walletApi.summary(),
    'wallet-summary',
  );
  const movements = useApiData<WalletMovement[]>(
    () => walletApi.movements(1, 5).then((r) => (Array.isArray(r) ? r : r.data)),
    'wallet-last5',
  );

  const balance = wallet.data?.available ?? 0;
  const depositValid = depositAmount > 0 && depositAmount <= 10000;
  const withdrawValid = withdrawAmount > 0 && withdrawAmount <= balance;

  function fail(message: string) {
    setToast(message);
    setToastKind('error');
  }

  async function doDeposit() {
    if (!depositValid) {
      fail('Elige una cantidad entre 1 y 10.000 créditos DEMO.');
      return;
    }
    setBusy(true);
    try {
      await walletApi.deposit(depositAmount);
      setToast(`Depósito DEMO completado: +${formatCredits(depositAmount)} créditos DEMO.`);
      setToastKind('success');
      wallet.reload();
      movements.reload();
    } catch (err) {
      fail(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function doWithdraw() {
    setConfirmWithdraw(false);
    setBusy(true);
    try {
      await walletApi.withdraw(withdrawAmount);
      setToast(`Retiro DEMO completado: −${formatCredits(withdrawAmount)} créditos DEMO.`);
      setToastKind('success');
      wallet.reload();
      movements.reload();
    } catch (err) {
      fail(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (guest) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Tu billetera" />
        <DemoBanner />
        <div className="mt-4">
          <EmptyState
            illustration="coin"
            title="Los invitados no tienen billetera"
            description="Crea una cuenta para recibir créditos DEMO de bienvenida y gestionar tu saldo."
            actionLabel="Crear cuenta"
            actionHref="/registro"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Toast message={toast} kind={toastKind} onClose={() => setToast(null)} />
      <PageHeader title="Tu billetera" subtitle="Créditos virtuales de demostración." />
      <DemoBanner />

      {wallet.status === 'loading' && <ListSkeleton count={1} />}
      {wallet.status === 'error' && (
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">{wallet.error}</p>
          <Button variant="secondary" className="mt-3" onClick={wallet.reload}>Reintentar</Button>
        </div>
      )}
      {wallet.status === 'ok' && wallet.data && (
        <WalletCard available={wallet.data.available} reserved={wallet.data.reserved} showActions={false} />
      )}

      {/* Depósito demo */}
      <section aria-label="Depositar créditos DEMO" className="rounded-card border border-reto-gold/40 bg-reto-surface p-5">
        <SectionTitle>Depositar créditos DEMO</SectionTitle>
        <p className="text-sm text-white/60">Es una recarga de prueba. No es un pago real ni se descuenta dinero.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Cantidades sugeridas">
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setDepositAmount(a)}
              aria-pressed={depositAmount === a}
              className={`min-h-[44px] rounded-full px-4 text-sm font-semibold ${
                depositAmount === a ? 'bg-reto-demo text-reto-cream' : 'border border-white/15 bg-reto-elevated'
              }`}
            >
              {formatCredits(a)} <DemoBadge />
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Field label="Otra cantidad" id="deposit-amount" error={depositValid ? null : 'Escribe una cantidad entre 1 y 10.000 créditos DEMO.'}>
            <TextInput
              id="deposit-amount"
              type="number"
              min={1}
              max={10000}
              value={depositAmount}
              onChange={(e) => setDepositAmount(Number(e.target.value))}
              error={depositValid ? null : 'error'}
            />
          </Field>
        </div>
        <p className="mt-3 rounded-lg bg-reto-elevated p-3 text-sm">
          Vas a recibir <strong className="font-mono text-reto-demo">{formatCreditsDemo(depositAmount)}</strong>. Tu saldo
          pasará de <strong className="font-mono">{formatCredits(balance)} créditos DEMO</strong> a{' '}
          <strong className="font-mono text-reto-demo">{formatCredits(balance + depositAmount)} créditos DEMO</strong>.
        </p>
        <Button className="mt-3 w-full" onClick={doDeposit} disabled={busy || !depositValid}>
          {busy ? 'Depositando…' : 'Confirmar depósito demo'}
        </Button>
      </section>

      {/* Retiro demo */}
      <section aria-label="Retirar créditos DEMO" className="rounded-card border border-reto-gold/40 bg-reto-surface p-5">
        <SectionTitle>Retirar créditos DEMO</SectionTitle>
        <p className="text-sm text-white/60">Es una operación de prueba. No recibirás dinero real.</p>
        <div className="mt-3">
          <Field
            label="Cantidad"
            id="withdraw-amount"
            hint={`Saldo disponible: ${formatCredits(balance)} créditos DEMO.`}
            error={withdrawAmount > balance ? 'No tienes suficientes créditos DEMO.' : null}
          >
            <TextInput
              id="withdraw-amount"
              type="number"
              min={0}
              max={balance}
              value={withdrawAmount || ''}
              onChange={(e) => setWithdrawAmount(Number(e.target.value))}
              error={withdrawAmount > balance ? 'error' : null}
            />
          </Field>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" onClick={() => setWithdrawAmount(balance)} disabled={balance === 0}>
            Retirar todo
          </Button>
        </div>
        {withdrawValid && (
          <p className="mt-3 rounded-lg bg-reto-elevated p-3 text-sm">
            Vas a retirar <strong className="font-mono text-reto-demo">{formatCreditsDemo(withdrawAmount)}</strong>. Tu saldo
            pasará de <strong className="font-mono">{formatCredits(balance)} créditos DEMO</strong> a{' '}
            <strong className="font-mono text-reto-demo">{formatCredits(balance - withdrawAmount)} créditos DEMO</strong>.
          </p>
        )}
        <Button className="mt-3 w-full" variant="danger" onClick={() => setConfirmWithdraw(true)} disabled={busy || !withdrawValid}>
          Retirar créditos DEMO
        </Button>
      </section>

      {/* Últimos movimientos */}
      <section aria-label="Últimos movimientos">
        <SectionTitle>Últimos movimientos</SectionTitle>
        {movements.status === 'loading' && <ListSkeleton count={3} />}
        {movements.status === 'error' && <p className="text-sm text-white/60">No pudimos cargar los movimientos ahora mismo.</p>}
        {movements.status === 'ok' && (movements.data?.length ?? 0) === 0 && (
          <EmptyState illustration="coin" title="Aún no tienes movimientos." description="Tus depósitos, retiros y premios aparecerán aquí." actionLabel="Cómo conseguir créditos DEMO" actionHref="/ayuda" />
        )}
        {movements.status === 'ok' && (movements.data?.length ?? 0) > 0 && (
          <ul className="flex flex-col gap-2">
            {movements.data!.map((m) => {
              const s = movementSign(m.direction);
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-card border border-reto-gold/40 bg-reto-surface px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.description}</p>
                    <p className="text-xs text-white/50">{new Date(m.createdAt).toLocaleDateString('es-ES')}</p>
                  </div>
                  <p className={`font-mono font-bold ${s.className}`}>
                    {s.sign}{formatCredits(m.amount)} <span className="text-[11px]">DEMO</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/billetera/historial" className="mt-3 inline-block text-sm text-reto-gold underline underline-offset-2">
          Ver todo el historial
        </Link>
      </section>

      {confirmWithdraw && (
        <Modal
          title={`¿Retirar ${formatCredits(withdrawAmount)} créditos DEMO?`}
          confirmLabel="Sí, retirar"
          onConfirm={doWithdraw}
          onCancel={() => setConfirmWithdraw(false)}
          busy={busy}
          danger
        >
          <p>
            Tu saldo pasará de {formatCredits(balance)} a {formatCredits(balance - withdrawAmount)} créditos DEMO.
            Esta acción no se puede deshacer.
          </p>
        </Modal>
      )}
    </div>
  );
}

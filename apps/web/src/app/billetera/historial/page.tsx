// Historial de movimientos (DESIGN.md §9): lista cronológica con
// filtros por tipo y periodo, «Cargar más» y contador «Mostrando X de Y».
'use client';

import { useMemo, useState } from 'react';
import { walletApi } from '../../../lib/auth';
import { asList, asTotal, useApiData } from '../../../lib/useApi';
import { formatCredits, formatDateTime } from '../../../lib/format';
import type { WalletMovement } from '../../../lib/types';
import { DemoBanner } from '../../../components/DemoBadge';
import EmptyState from '../../../components/EmptyState';
import { ListSkeleton } from '../../../components/Spinner';
import { Button, PageHeader } from '../../../components/ui';

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [period, setPeriod] = useState('ALL');
  const [all, setAll] = useState<WalletMovement[]>([]);

  const result = useApiData(
    () =>
      walletApi.movements(page, PAGE_SIZE).then((r) => {
        const list = asList(r);
        setAll((prev) => (page === 1 ? list : [...prev, ...list]));
        return { list, total: asTotal(r, list) };
      }),
    `history-${page}`,
  );

  const filtered = useMemo(() => {
    let list = all;
    if (typeFilter !== 'ALL') list = list.filter((m) => m.type === typeFilter);
    if (period !== 'ALL') {
      const days = Number(period);
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      list = list.filter((m) => new Date(m.createdAt).getTime() >= since);
    }
    return list;
  }, [all, typeFilter, period]);

  const total = result.data?.total ?? 0;
  const hasMore = all.length < total;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title="Historial de movimientos" subtitle="Todos tus movimientos de créditos DEMO, del más reciente al más antiguo." />
      <DemoBanner />

      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-2 text-sm">
          Tipo
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-white/15 bg-reto-elevated px-2 py-2 text-sm" aria-label="Filtrar por tipo">
            <option value="ALL">Todos</option>
            <option value="DEPOSIT">Depósitos</option>
            <option value="WITHDRAWAL">Retiros</option>
            <option value="WIN_PAYOUT">Premios</option>
            <option value="BET_HOLD">Apuestas</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          Periodo
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-white/15 bg-reto-elevated px-2 py-2 text-sm" aria-label="Filtrar por periodo">
            <option value="ALL">Todo</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
          </select>
        </label>
      </div>

      {result.status === 'loading' && page === 1 && <ListSkeleton count={5} />}
      {result.status === 'error' && page === 1 && (
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">{result.error}</p>
          <Button variant="secondary" className="mt-3" onClick={result.reload}>Reintentar</Button>
        </div>
      )}
      {result.status === 'ok' && filtered.length === 0 && (
        <EmptyState
          illustration="coin"
          title={typeFilter === 'ALL' && period === 'ALL' ? 'Aún no tienes movimientos.' : 'No hay movimientos con ese filtro.'}
          description="Tus depósitos, retiros y premios aparecerán aquí."
          actionLabel="Limpiar filtros"
          onAction={() => {
            setTypeFilter('ALL');
            setPeriod('ALL');
          }}
        />
      )}
      {filtered.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {filtered.map((m) => (
              <li key={m.id} className="rounded-card border border-reto-gold/40 bg-reto-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{m.description}</p>
                    <p className="text-xs text-white/50">{formatDateTime(m.createdAt)} · {m.type}</p>
                  </div>
                  <p className={`shrink-0 font-mono font-bold ${m.direction === 'CREDIT' ? 'text-reto-success' : 'text-reto-error'}`}>
                    {m.direction === 'CREDIT' ? '+' : '−'}{formatCredits(m.amount)} <span className="text-[11px]">DEMO</span>
                  </p>
                </div>
                <p className="mt-1 text-xs text-white/50">
                  Saldo resultante: <span className="font-mono text-reto-demo">{formatCredits(m.balanceAfter)} créditos DEMO</span>
                </p>
              </li>
            ))}
          </ul>
          <p className="text-center text-sm text-white/60">
            Mostrando {filtered.length} de {total}
          </p>
          {hasMore && (
            <Button variant="secondary" className="self-center" onClick={() => setPage((p) => p + 1)} disabled={result.status === 'loading'}>
              {result.status === 'loading' ? 'Cargando…' : 'Cargar más'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

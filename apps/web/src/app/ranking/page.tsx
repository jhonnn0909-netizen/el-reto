// Ranking (doc 04 D8 + mejoras 1 y 9): tabla de posiciones con
// victorias, racha actual, mejor racha y nivel con su título.
'use client';

import { gameApi } from '../../lib/auth';
import { asList, useApiData } from '../../lib/useApi';
import type { RankingEntry } from '../../lib/types';
import RankingTable from '../../components/RankingTable';
import EmptyState from '../../components/EmptyState';
import { ListSkeleton } from '../../components/Spinner';
import { Button, PageHeader } from '../../components/ui';

export default function RankingPage() {
  const ranking = useApiData<RankingEntry[]>(
    () => gameApi.ranking(50).then((r) => asList(r)),
    'ranking-list',
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ranking" subtitle="Las posiciones se ordenan por victorias y puntos. Las rachas cuentan las victorias seguidas." />
      {ranking.status === 'loading' && <ListSkeleton count={5} />}
      {ranking.status === 'error' && (
        <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
          <p className="text-sm">{ranking.error}</p>
          <Button variant="secondary" className="mt-3" onClick={ranking.reload}>Reintentar</Button>
        </div>
      )}
      {ranking.status === 'ok' && (ranking.data?.length ?? 0) === 0 && (
        <EmptyState illustration="trophy" title="Aún no hay ranking." description="Juega tu primera partida y aparece en la tabla." actionLabel="Jugar ahora" actionHref="/retos/crear" />
      )}
      {ranking.status === 'ok' && (ranking.data?.length ?? 0) > 0 && (
        <RankingTable entries={ranking.data!} />
      )}
    </div>
  );
}

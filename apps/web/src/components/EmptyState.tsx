// Pantalla vacía (DESIGN.md §7): ilustración + frase + siguiente paso.
// Nunca es un error: sin color de error ni lenguaje de culpa.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from './ui';
import { HandsRow } from './Hands';

export default function EmptyState({
  illustration = 'hands',
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  illustration?: 'hands' | 'bell' | 'coin' | 'trophy' | 'search';
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const art: Record<string, ReactNode> = {
    hands: <HandsRow size={56} />,
    bell: <span aria-hidden="true" className="text-5xl">🔔</span>,
    coin: <span aria-hidden="true" className="text-5xl">🪙</span>,
    trophy: <span aria-hidden="true" className="text-5xl">🏆</span>,
    search: <span aria-hidden="true" className="text-5xl">🔍</span>,
  };
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-reto-gold/40 bg-reto-surface px-6 py-10 text-center">
      {art[illustration]}
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-white/60">{description}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <Button>{actionLabel}</Button>
        </Link>
      )}
      {actionLabel && onAction && !actionHref && <Button onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

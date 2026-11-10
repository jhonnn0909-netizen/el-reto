// Tarjeta de saldo DEMO (DESIGN.md §8). Toda cifra con etiqueta DEMO
// y color reto.demo. Saldo cero como invitación, no como error.
'use client';

import Link from 'next/link';
import { formatCredits } from '../lib/format';
import { Button } from './ui';
import { DemoBadge } from './DemoBadge';

export default function WalletCard({
  available,
  reserved = 0,
  showActions = true,
}: {
  available: number;
  reserved?: number;
  showActions?: boolean;
}) {
  return (
    <section
      aria-label="Saldo de la billetera DEMO"
      className="rounded-card border border-reto-demo/40 bg-reto-surface p-5"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-white/60">Saldo disponible</h2>
        <DemoBadge />
      </div>
      <p className="mt-1 font-mono text-4xl font-bold text-reto-demo">
        {formatCredits(available)}
        <span className="ml-2 font-sans text-base font-semibold text-white/70">créditos DEMO</span>
      </p>
      {reserved > 0 && (
        <p className="mt-1 text-sm text-white/60">
          Reservados en retos: <span className="font-mono text-reto-demo">{formatCredits(reserved)} créditos DEMO</span>
        </p>
      )}
      {available === 0 && (
        <p className="mt-3 text-sm text-white/70">
          Tienes 0 créditos DEMO. Consigue créditos con un depósito demo.
        </p>
      )}
      {showActions && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/billetera">
            <Button>Depositar (demo)</Button>
          </Link>
          <Link href="/billetera">
            <Button variant="secondary">Retirar (demo)</Button>
          </Link>
          <Link href="/billetera/historial">
            <Button variant="ghost">Ver historial</Button>
          </Link>
        </div>
      )}
    </section>
  );
}

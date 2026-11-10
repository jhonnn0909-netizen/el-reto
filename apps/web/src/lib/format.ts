// Formato de cifras y fechas (es-ES, DESIGN.md §1 y doc 04 §3.3).
// useGrouping: true es obligatorio: con "auto" algunos motores ICU
// no agrupan 1.250 y el diseño exige el separador de miles (1.000).
export function formatCredits(amount: number): string {
  return new Intl.NumberFormat('es-ES', { useGrouping: true }).format(amount);
}

export function formatCreditsDemo(amount: number): string {
  return `${formatCredits(amount)} créditos DEMO`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return 'ahora mismo';
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `hace ${days} d`;
  return formatDateTime(iso);
}

export function formatScore(score1: number, score2: number): string {
  return `${score1}–${score2}`;
}

/**
 * Signo y color de un movimiento de billetera (lo que ve el usuario):
 * CREDIT = entra dinero («+», verde), DEBIT = sale dinero («−», rojo),
 * NEUTRAL = movimiento interno sin cambio de saldo (sin signo, gris).
 */
export function movementSign(direction: 'DEBIT' | 'CREDIT' | 'NEUTRAL'): {
  sign: string;
  className: string;
} {
  if (direction === 'CREDIT') return { sign: '+', className: 'text-reto-success' };
  if (direction === 'DEBIT') return { sign: '−', className: 'text-reto-error' };
  return { sign: '', className: 'text-white/60' };
}

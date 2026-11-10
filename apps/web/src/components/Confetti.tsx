// Confeti DORADO al ganar (DESIGN.md §6): piezas #ffe98a, #f5c542,
// #c9962e y plateadas, 1,5 s, desactivable en ajustes.
// Con prefers-reduced-motion no se muestra.
'use client';

import { useMemo } from 'react';
import { prefersReducedMotion } from '../lib/session';

const COLORS = ['#ffe98a', '#f5c542', '#c9962e', '#c0c0c0', '#fff7d6'];

export default function Confetti({ disabled = false }: { disabled?: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        left: (i * 37 + 11) % 100,
        delay: (i % 8) * 0.12,
        color: COLORS[i % COLORS.length],
        size: 6 + (i % 3) * 3,
        round: i % 2 === 0,
      })),
    [],
  );

  if (disabled || prefersReducedMotion()) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="animate-confetti-fall absolute -top-4"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * (p.round ? 1 : 0.5),
            backgroundColor: p.color,
            borderRadius: p.round ? '50%' : '2px',
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

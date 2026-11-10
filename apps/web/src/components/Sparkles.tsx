// Destellos dorados (confeti de luz, DESIGN.md §6): puntos de luz con
// .gold-sparkle, cayendo (animate-sparkle-fall) o parpadeando
// (animate-sparkle-twinkle). Fondo ambiental (pocos, lentos) y victoria
// (densos). Con prefers-reduced-motion no se muestran.
'use client';

import { useMemo } from 'react';
import { prefersReducedMotion } from '../lib/session';

export default function Sparkles({ density = 'ambient' }: { density?: 'ambient' | 'dense' }) {
  const count = density === 'dense' ? 18 : 7;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 53 + 7) % 100,
        top: (i * 29 + 5) % 80,
        delay: (i % 6) * 1.1,
        duration: 5 + (i % 4),
        size: 4 + (i % 3) * 3,
        falling: i % 2 === 0,
      })),
    [count],
  );

  if (prefersReducedMotion()) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`gold-sparkle ${p.falling ? 'animate-sparkle-fall' : 'animate-sparkle-twinkle'}`}
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

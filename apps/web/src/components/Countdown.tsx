// Cuenta atrás del ritual de inicio de ronda (DESIGN.md §6):
// «¡PIEDRA! ¡PAPEL! ¡TIJERAS!» ~600 ms por palabra. Con
// prefers-reduced-motion se muestra como texto estático.
'use client';

import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../lib/session';

const WORDS = ['¡PIEDRA!', '¡PAPEL!', '¡TIJERAS!'];

export default function Countdown({ onDone }: { onDone?: () => void }) {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (reduced) {
      const t = setTimeout(() => onDone?.(), 900);
      return () => clearTimeout(t);
    }
    if (index >= WORDS.length) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, reduced]);

  if (reduced) {
    return (
      <p className="text-center font-display text-2xl font-black tracking-wide text-reto-gold" aria-live="polite">
        PIEDRA · PAPEL · TIJERAS
      </p>
    );
  }
  if (index >= WORDS.length) return null;
  return (
    <p
      key={index}
      className="animate-countdown-pop text-center font-display text-3xl font-black tracking-wide text-reto-gold md:text-4xl"
      aria-live="polite"
    >
      {WORDS[index]}
    </p>
  );
}

// Manos REALES (DESIGN.md §2.1 y §2.2).
// - Las FOTOS (mano-*.jpg) SOLO valen para ELEGIR la jugada (botones).
// - Toda animación de juego es VÍDEO real (public/video/); ninguna foto
//   quieta se mueve con CSS (la animación `sacudida` está PROHIBIDA y
//   ya no existe en tailwind.config.js).
// - Con prefers-reduced-motion los vídeos NO se reproducen: se muestra
//   la foto del gesto revelado.
'use client';

import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../lib/session';
import type { Move } from '../lib/types';

export const HAND_PHOTOS: Record<Move, { src: string; alt: string; label: string }> = {
  ROCK: { src: '/img/mano-piedra.jpg', alt: 'Mano real: piedra', label: 'Piedra' },
  PAPER: { src: '/img/mano-papel.jpg', alt: 'Mano real: papel', label: 'Papel' },
  SCISSORS: { src: '/img/mano-tijera.jpg', alt: 'Mano real: tijera', label: 'Tijera' },
};

const REVEAL_VIDEOS: Record<Move, string> = {
  ROCK: '/video/revelar-piedra.mp4',
  PAPER: '/video/revelar-papel.mp4',
  SCISSORS: '/video/revelar-tijera.mp4',
};

/** Movimiento reducido (ajuste del sistema o de la app). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);
  return reduced;
}

/** Foto de una jugada: SOLO para elegir la jugada (botón). Nunca animada. */
export function Hand({ move, size = 72 }: { move: Move; size?: number }) {
  const photo = HAND_PHOTOS[move];
  return (
    <img
      src={photo.src}
      alt={photo.alt}
      width={size}
      height={size}
      className="rounded-xl border border-reto-gold/50 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/** Las tres fotos de jugada con su nombre debajo (portada y vacíos). */
export function HandsRow({ size = 64 }: { size?: number }) {
  const moves: Move[] = ['ROCK', 'PAPER', 'SCISSORS'];
  return (
    <div className="flex items-start justify-center gap-6" role="list" aria-label="Piedra, papel o tijera">
      {moves.map((m) => (
        <div key={m} role="listitem" className="flex flex-col items-center gap-1">
          <Hand move={m} size={size} />
          <span className="text-sm font-semibold text-reto-cream/80">{HAND_PHOTOS[m].label}</span>
        </div>
      ))}
    </div>
  );
}

/** Vídeo de manos sacudiéndose (manos-sacudida.mp4, 2 s en bucle):
 * cuenta atrás de cada ronda y espera de jugada. Sin controles. */
export function ShakeVideo({ label = 'Manos reales sacudiéndose antes de jugar' }: { label?: string }) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <img
        src="/img/manos.png"
        alt="Manos reales jugando piedra, papel o tijera"
        className="block h-auto w-full rounded-xl border border-reto-gold/50"
      />
    );
  }
  return (
    <video
      src="/video/manos-sacudida.mp4"
      aria-label={label}
      className="block h-auto w-full rounded-xl border border-reto-gold/50"
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
    />
  );
}

/** Vídeo de revelado de una jugada (revelar-*.mp4, 7 s). El lado del
 * rival se espeja con scaleX(-1). Sin controles. */
export function RevealVideo({
  move,
  mirrored = false,
}: {
  move: Move;
  mirrored?: boolean;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <Hand move={move} size={120} />;
  }
  return (
    <video
      src={REVEAL_VIDEOS[move]}
      aria-label={`Vídeo real: revelado de ${HAND_PHOTOS[move].label.toLowerCase()}`}
      className="animate-reveal-rise block h-auto w-full max-w-[280px] rounded-xl border border-reto-gold/50"
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
      autoPlay
      muted
      playsInline
      preload="auto"
    />
  );
}

/** Vídeo de celebración con rayos y brillos (manos-rps-rayos-brillos.mp4,
 * 10 s): fondo de la pantalla de victoria y revelado destacado. */
export function CelebrationVideo({ className = '' }: { className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <img
        src="/img/trofeo.jpg"
        alt="Trofeo dorado sobre fondo negro"
        className={`block h-auto w-full rounded-xl border border-reto-gold/50 object-cover ${className}`}
      />
    );
  }
  return (
    <video
      src="/video/manos-rps-rayos-brillos.mp4"
      aria-label="Vídeo real: manos con destellos dorados y rayos de energía"
      className={`block h-auto w-full rounded-xl border border-reto-gold/50 ${className}`}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
    />
  );
}

/** Trofeo dorado: imagen principal de la portada y del ganador. */
export function TrophyPhoto({ caption }: { caption?: string }) {
  return (
    <figure className="mx-auto max-w-[520px] overflow-hidden rounded-[20px] border-2 border-reto-gold/65 shadow-[0_0_40px_rgba(245,197,66,0.35),0_10px_30px_rgba(0,0,0,0.6)]">
      <img src="/img/trofeo.jpg" alt="Trofeo dorado sobre fondo negro" className="block h-auto w-full" />
      {caption && (
        <figcaption className="bg-[#0a0804]/90 px-2 py-2 text-center text-xs font-bold uppercase tracking-[2px] text-reto-gold">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// Logo oficial de El Reto: VS cromado con rayos de neón (opción 1 elegida
// por Jhon), animado con pulso y brillo. SVG propio, sin archivos
// externos. Ver apps/web/DESIGN.md §1 y doc 04 §3.1.
//
// ¡NO CAMBIAR! Orden de Jhon (2026-11-10): el logo se queda
// exactamente como fue aprobado. NO pasarlo a dorado, NO rediseñarlo,
// NO cambiarle la forma ni los rayos. El estilo negro y oro aplica
// solo al entorno (fondos, tarjetas, botones, ranking); el logo
// queda intacto tal como está en el juego actual.
//
// `animated={false}` para la versión pequeña y estática del resto de
// pantallas y para `prefers-reduced-motion` (el CSS global ya detiene
// la animación en ese caso).

interface LogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

export default function Logo({ size = 48, animated = true, className = '' }: LogoProps) {
  return (
    <span
      className={`${animated ? 'animate-logo-pulse' : ''} inline-flex shrink-0 ${className}`}
      role="img"
      aria-label="El Reto"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="reto-chrome" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="35%" stopColor="#cbd5e1" />
            <stop offset="55%" stopColor="#64748b" />
            <stop offset="75%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
          <linearGradient id="reto-ray" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <filter id="reto-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Rayos neón detrás de las letras */}
        <g stroke="url(#reto-ray)" strokeWidth="4" strokeLinecap="round" opacity="0.85" filter="url(#reto-glow)">
          <line x1="60" y1="4" x2="60" y2="20" />
          <line x1="60" y1="100" x2="60" y2="116" />
          <line x1="4" y1="60" x2="20" y2="60" />
          <line x1="100" y1="60" x2="116" y2="60" />
          <line x1="20" y1="20" x2="31" y2="31" />
          <line x1="89" y1="89" x2="100" y2="100" />
          <line x1="100" y1="20" x2="89" y2="31" />
          <line x1="31" y1="89" x2="20" y2="100" />
        </g>
        {/* VS cromado */}
        <text
          x="60"
          y="80"
          textAnchor="middle"
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="52"
          fontWeight="900"
          fontStyle="italic"
          fill="url(#reto-chrome)"
          stroke="#0f172a"
          strokeWidth="1.5"
          filter="url(#reto-glow)"
        >
          VS
        </text>
      </svg>
    </span>
  );
}

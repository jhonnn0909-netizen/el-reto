/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        reto: {
          bg: '#050505',
          surface: '#120e06',
          elevated: '#1c1608',
          gold: '#f5c542',
          goldLight: '#ffe98a',
          goldDark: '#c9962e',
          goldText: '#fff7d6',
          cream: '#f5f0e1',
          silver: '#c0c0c0',
          silverLight: '#d7dbe0',
          bronze: '#8c5a2b',
          bronzeLight: '#f0a35e',
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
          demo: '#8b5cf6',
          pink: '#ec4899',
        },
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      maxWidth: {
        reto: '1200px',
      },
      borderRadius: {
        card: '12px',
        panel: '16px',
      },
      keyframes: {
        'logo-pulse': {
          '0%, 100%': { transform: 'scale(1)', filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.55))' },
          '50%': { transform: 'scale(1.06)', filter: 'drop-shadow(0 0 16px rgba(34,211,238,0.9))' },
        },
        'countdown-pop': {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '30%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'hand-shake': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '25%': { transform: 'translateY(-10px) rotate(-4deg)' },
          '75%': { transform: 'translateY(-10px) rotate(4deg)' },
        },
        'reveal-rise': {
          '0%': { transform: 'translateY(12px) scale(0.92)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        'confetti-fall': {
          '0%': { transform: 'translateY(-10%) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(110vh) rotate(720deg)', opacity: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'skeleton-pulse': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        'badge-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        /* Rayos de energía girando despacio (arena y celebración). */
        'rays-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        /* Destellos dorados cayendo como confeti de luz. */
        'sparkle-fall': {
          '0%': { transform: 'translateY(-8vh) scale(0.6)', opacity: '0' },
          '15%': { opacity: '1' },
          '85%': { opacity: '1' },
          '100%': { transform: 'translateY(108vh) scale(1)', opacity: '0' },
        },
        /* Parpadeo suave de un destello dorado. */
        'sparkle-twinkle': {
          '0%, 100%': { opacity: '0.25', transform: 'scale(0.7)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
      },
      animation: {
        'logo-pulse': 'logo-pulse 2s ease-in-out infinite',
        'countdown-pop': 'countdown-pop 600ms ease-out both',
        'hand-shake': 'hand-shake 300ms ease-in-out',
        'reveal-rise': 'reveal-rise 300ms ease-out both',
        'confetti-fall': 'confetti-fall 1.5s ease-in forwards',
        'fade-in': 'fade-in 200ms ease-out both',
        'skeleton-pulse': 'skeleton-pulse 1.5s ease-in-out infinite',
        'badge-pulse': 'badge-pulse 1.4s ease-in-out infinite',
        /* Rayos de energía en la arena y la celebración. */
        'rays-spin': 'rays-spin 12s linear infinite',
        /* Destellos dorados cayendo como confeti de luz. */
        'sparkle-fall': 'sparkle-fall 7s linear infinite',
        'sparkle-twinkle': 'sparkle-twinkle 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

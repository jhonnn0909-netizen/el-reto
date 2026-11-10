import type { Metadata } from 'next';
import Link from 'next/link';
import Logo from '../components/Logo';
import HeaderAuth from '../components/HeaderAuth';
import './globals.css';

export const metadata: Metadata = {
  title: 'El Reto — Juegos en vivo',
  description:
    'El Reto: retos en vivo de piedra, papel o tijera con créditos virtuales (demo, sin valor real).',
};

const NAV = [
  { href: '/', label: 'Inicio' },
  { href: '/juegos', label: 'Jugar' },
  { href: '/retos', label: 'Retos' },
  { href: '/ranking', label: 'Ranking' },
  { href: '/ayuda', label: 'Ayuda' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-reto-bg font-sans text-reto-cream antialiased">
        {/* Barra superior (tableta y escritorio; en móvil solo logo + entrar) */}
        {/* relative z-20: queda por encima del panel lateral fijo, para que
            sus enlaces nunca queden tapados por él. */}
        <header className="relative z-20 border-b border-reto-gold/25 bg-reto-surface/80 backdrop-blur">
          <div className="mx-auto flex max-w-reto items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2" aria-label="El Reto — inicio">
              <Logo size={40} />
              <span className="gold-text font-display text-xl font-black tracking-wide">EL RETO</span>
            </Link>
            <nav className="hidden items-center gap-5 text-sm text-reto-cream/80 md:flex" aria-label="Navegación principal">
              {NAV.slice(1).map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-reto-gold">
                  {item.label}
                </Link>
              ))}
            </nav>
            <HeaderAuth />
          </div>
        </header>

        <main className="mx-auto max-w-reto px-4 pb-28 pt-6 md:pb-10">{children}</main>

        <footer className="hidden border-t border-reto-gold/25 py-6 text-center text-xs text-[#cbbf9a] md:block">
          El Reto — los créditos son virtuales (DEMO), sin valor real. Aquí no se
          juega con dinero real.
        </footer>

        {/* Barra inferior móvil (doc 04 §6.2) + botón flotante «Crear reto» */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-reto-gold/25 bg-reto-surface/95 backdrop-blur md:hidden"
          aria-label="Navegación móvil"
        >
          <div className="relative mx-auto grid max-w-reto grid-cols-4 px-2 pb-2 pt-2 text-center text-[11px] text-reto-cream/80">
            <Link href="/" className="flex flex-col items-center gap-0.5 py-1">
              <span aria-hidden="true">🏠</span>Inicio
            </Link>
            <Link href="/juegos" className="flex flex-col items-center gap-0.5 py-1">
              <span aria-hidden="true">✊</span>Jugar
            </Link>
            <Link href="/retos" className="flex flex-col items-center gap-0.5 py-1">
              <span aria-hidden="true">⚔️</span>Retos
            </Link>
            <Link href="/panel" className="flex flex-col items-center gap-0.5 py-1">
              <span aria-hidden="true">👤</span>Perfil
            </Link>
            <Link
              href="/retos/crear"
              aria-label="Crear reto"
              className="absolute -top-6 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-b from-reto-goldLight via-reto-gold to-reto-goldDark text-2xl font-bold text-[#1a1206] shadow-lg shadow-reto-gold/50"
            >
              +
            </Link>
          </div>
        </nav>
      </body>
    </html>
  );
}

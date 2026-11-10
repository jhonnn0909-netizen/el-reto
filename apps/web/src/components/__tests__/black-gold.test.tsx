// Entorno negro y oro (DESIGN.md reescrito 2026-11-10): fondo casino,
// VÍDEOS de manos reales (nunca foto quieta con CSS), confeti dorado,
// rayos de energía, destellos, botón dorado, medallas, panel v7 y
// logo VS cromado con rayos de neón INTACTO.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CelebrationVideo, Hand, HandsRow, RevealVideo, ShakeVideo } from '../Hands';
import Sparkles from '../Sparkles';
import OnlinePanel from '../OnlinePanel';
import Confetti from '../Confetti';
import WinnerCard from '../WinnerCard';
import Countdown from '../Countdown';
import { Button } from '../ui';
import { Medal } from '../RankingTable';
import Logo from '../Logo';
import { setPrefs } from '../../lib/session';
import HomePage from '../../app/page';

describe('Manos reales en VÍDEO (nunca foto quieta con CSS)', () => {
  it('cada jugada es una foto real con borde dorado (solo para elegir)', () => {
    const { container } = render(<Hand move="ROCK" />);
    const img = screen.getByRole('img', { name: 'Mano real: piedra' });
    expect(img.getAttribute('src')).toBe('/img/mano-piedra.jpg');
    expect(img.className).toContain('border-reto-gold');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('la cuenta atrás usa el vídeo de manos sacudiéndose, en bucle y sin controles', () => {
    const { container } = render(<ShakeVideo />);
    const video = container.querySelector('video') as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe('/video/manos-sacudida.mp4');
    expect(video!.loop).toBe(true);
    expect(video!.muted).toBe(true);
    expect(video!.hasAttribute('playsinline')).toBe(true);
    expect(video!.hasAttribute('controls')).toBe(false);
    expect(container.querySelector('.animate-sacudida')).toBeNull();
  });

  it('el revelado usa un clip por jugada; el del rival se espeja', () => {
    const { container } = render(<RevealVideo move="ROCK" />);
    const video = container.querySelector('video') as HTMLVideoElement | null;
    expect(video!.getAttribute('src')).toBe('/video/revelar-piedra.mp4');
    expect(video!.muted).toBe(true);
    const { container: rival } = render(<RevealVideo move="PAPER" mirrored />);
    const rivalVideo = rival.querySelector('video');
    expect(rivalVideo!.getAttribute('src')).toBe('/video/revelar-papel.mp4');
    expect(rivalVideo!.style.transform).toContain('scaleX(-1)');
  });

  it('la celebración usa el vídeo con rayos y brillos', () => {
    const { container } = render(<CelebrationVideo />);
    const video = container.querySelector('video') as HTMLVideoElement | null;
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe('/video/manos-rps-rayos-brillos.mp4');
    expect(video!.loop).toBe(true);
  });

  it('con movimiento reducido los vídeos no se reproducen: se muestra la foto', async () => {
    setPrefs({ reduceMotion: true });
    try {
      const { container } = render(<ShakeVideo />);
      expect(container.querySelector('video')).toBeNull();
      expect(await screen.findByRole('img', { name: /Manos reales jugando/ })).toBeInTheDocument();
    } finally {
      setPrefs({ reduceMotion: false });
    }
  });

  it('las tres fotos de jugada siguen visibles en la portada, sin animación CSS', () => {
    const { container } = render(<HandsRow />);
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(container.querySelector('.animate-sacudida')).toBeNull();
  });
});

describe('Destellos dorados (confeti de luz)', () => {
  it('el fondo ambiental tiene pocos destellos y la victoria, densos', () => {
    const { container, unmount } = render(<Sparkles density="ambient" />);
    expect(container.querySelectorAll('.gold-sparkle')).toHaveLength(7);
    unmount();
    const dense = render(<Sparkles density="dense" />);
    expect(dense.container.querySelectorAll('.gold-sparkle')).toHaveLength(18);
    expect(dense.container.querySelector('.animate-sparkle-fall')).not.toBeNull();
    expect(dense.container.querySelector('.animate-sparkle-twinkle')).not.toBeNull();
  });
});

describe('Panel en línea v7 (APROBADO)', () => {
  const people = [
    { userId: 'u1', username: 'Jhon', status: 'LIBRE' as const },
    { userId: 'u2', username: 'Alcon', status: 'JUGANDO' as const },
  ];

  it('en escritorio es fijo de 200 px a la derecha; en móvil, fijo arriba', () => {
    const { container } = render(<OnlinePanel people={people} />);
    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside!.className).toContain('min-[900px]:fixed');
    expect(aside!.className).toContain('w-[200px]');
    expect(aside!.className).toContain('sticky');
    expect(aside!.className).toContain('top-0');
  });

  it('las filas muestran SOLO nombre y estado, sin avatar, y no es un cajón', () => {
    const { container } = render(<OnlinePanel people={people} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Jhon')).toBeInTheDocument();
    expect(screen.getAllByText('LIBRE').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /En línea \(/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Confeti dorado', () => {
  it('usa solo dorados y plateados, nunca cian', () => {
    const { container } = render(<Confetti />);
    const html = container.innerHTML;
    expect(html).not.toContain('22d3ee');
    expect(container.querySelectorAll('.animate-confetti-fall').length).toBeGreaterThan(0);
  });
});

describe('Cuenta atrás dorada', () => {
  it('la palabra del ritual va en dorado', () => {
    render(<Countdown />);
    expect(screen.getByText('¡PIEDRA!').className).toContain('text-reto-gold');
  });
});

describe('Botón principal dorado', () => {
  it('usa el degradado dorado con texto oscuro', () => {
    render(<Button>Crear reto</Button>);
    const btn = screen.getByRole('button', { name: 'Crear reto' });
    expect(btn.className).toContain('from-reto-goldLight');
    expect(btn.className).toContain('text-[#1a1206]');
  });
});

describe('Medallas del ranking', () => {
  it('1.º dorado, 2.º plateado, 3.º bronce', () => {
    const { container } = render(
      <div>
        <Medal position={1} />
        <Medal position={2} />
        <Medal position={3} />
      </div>,
    );
    const medals = container.querySelectorAll('span[aria-label^="Posición"]');
    expect(medals).toHaveLength(3);
    expect(medals[0].className).toContain('from-reto-goldLight');
    expect(medals[1].className).toContain('to-reto-silver');
    expect(medals[2].className).toContain('from-reto-bronzeLight');
  });
});

describe('Tarjeta del ganador en negro y oro', () => {
  it('muestra el trofeo, los rayos y el titular dorado', () => {
    render(
      <WinnerCard
        winnerName="Jhon"
        loserName="Alcon"
        scoreWinner={2}
        scoreLoser={1}
        formatLabel="Mejor de 3"
        matchId="m1"
        finishedAt={new Date().toISOString()}
        isWinner
      />,
    );
    expect(screen.getByRole('img', { name: 'Trofeo dorado sobre fondo negro' })).toBeInTheDocument();
    expect(document.querySelector('.energy-rays')).not.toBeNull();
    expect(screen.getByText('¡Ganaste la partida!').className).toContain('gold-text');
  });
});

describe('Logo intacto', () => {
  it('sigue siendo el VS cromado con rayos de neón, sin dorado', () => {
    const { container } = render(<Logo size={48} animated={false} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.innerHTML).toContain('reto-chrome');
    expect(svg!.innerHTML).toContain('reto-ray');
    expect(svg!.innerHTML).toContain('VS');
    expect(container.innerHTML).not.toContain('f5c542');
  });
});

describe('Portada en negro y oro', () => {
  it('el titular usa .gold-text y se ve el trofeo', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/challenges/daily')) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: [], page: 1, limit: 3, total: 0 }),
      });
    }) as unknown as typeof fetch;
    render(<HomePage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).toContain('gold-text');
    expect(await screen.findByRole('img', { name: 'Trofeo dorado sobre fondo negro' })).toBeInTheDocument();
  });
});

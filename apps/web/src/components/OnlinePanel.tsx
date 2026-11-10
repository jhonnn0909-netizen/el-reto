// Panel lateral de personas en línea (muestra v7, APROBADA por Jhon,
// DESIGN.md §5.1): columna derecha ANGOSTA y compacta de 200 px.
// - Escritorio (≥ 900 px): FIJA a un lado: position fixed, top 12 px,
//   right max(16px, calc((100vw - 1080px)/2 + 16px)), z-index 5.
//   Siempre visible al hacer scroll.
// - Teléfono: FIJA ARRIBA (position sticky, top 0, order -1, z-index 5,
//   fondo #0a0a0a), como en la v7; nunca se pierde al bajar por la
//   página y NUNCA es un cajón que se abre/cierra ni queda escondida abajo.
'use client';

import type { OnlinePerson } from '../lib/types';
import OnlineList from './OnlineList';

export default function OnlinePanel({
  people,
  inviteeName,
  onChallenge,
  loading = false,
}: {
  people: OnlinePerson[];
  inviteeName?: string | null;
  onChallenge?: (person: OnlinePerson) => void;
  loading?: boolean;
}) {
  return (
    <aside
      aria-label="Personas en línea"
      className="order-first sticky top-0 z-[5] bg-[#0a0a0a] min-[900px]:order-none min-[900px]:fixed min-[900px]:top-3 min-[900px]:w-[200px] min-[900px]:bg-transparent right-[max(16px,calc((100vw_-_1080px)/2_+_16px))]"
    >
      <OnlineList people={people} inviteeName={inviteeName} onChallenge={onChallenge} loading={loading} />
    </aside>
  );
}

// Panel lateral de personas en línea (muestra v7, APROBADA por Jhon,
// DESIGN.md §5.1): columna derecha ANGOSTA y compacta de 200 px.
// - Escritorio (≥ 900 px): FIJA a un lado: position fixed, top 76 px
//   (por DEBAJO de la cabecera, que mide ~65 px: antes iba a 12 px y
//   tapaba los enlaces "Entrar"/"Crear cuenta"), right
//   max(16px, calc((100vw - 1080px)/2 + 16px)), z-index 5.
//   Siempre visible al hacer scroll.
// - Teléfono: FIJA ARRIBA (position sticky, top 0, order -1, z-index 5,
//   fondo #0a0a0a), como en la v7; nunca se pierde al bajar por la
//   página y NUNCA es un cajón que se abre/cierra ni queda escondida abajo.
'use client';

import { useEffect } from 'react';
import { gameApi } from '../lib/auth';
import { getAccessToken } from '../lib/api';
import type { OnlinePerson } from '../lib/types';
import OnlineList from './OnlineList';

export default function OnlinePanel({
  people,
  inviteeName,
  onChallenge,
  loading = false,
  meId,
}: {
  people: OnlinePerson[];
  inviteeName?: string | null;
  onChallenge?: (person: OnlinePerson) => void;
  loading?: boolean;
  /** Id del usuario actual: se marca como «Tú» y no se le reta. */
  meId?: string | null;
}) {
  // Latido de presencia: la lista de Redis solo incluye a quien envía
  // heartbeats (TTL 60 s, cada 20 s). Antes el cliente web nunca lo
  // enviaba fuera de una partida, así que quien navegaba no aparecía
  // en línea y el panel marcaba (0) mientras decía «Eres la única
  // persona en línea». Con el latido, el contador incluye al usuario.
  // Tras cada latido correcto se avisa con 'elreto:presence' para que
  // la página recargue la lista en el acto: antes el primer latido y
  // la primera lectura corrían en paralelo y, si la lectura llegaba
  // antes, el usuario tardaba 20–60 s (1–3 ciclos de sondeo) en
  // aparecer en su propio panel.
  useEffect(() => {
    if (!getAccessToken()) return;
    let stopped = false;
    const beat = () => {
      gameApi
        .heartbeat()
        .then(() => {
          if (!stopped) window.dispatchEvent(new Event('elreto:presence'));
        })
        .catch(() => undefined);
    };
    beat();
    const timer = setInterval(() => {
      if (!stopped) beat();
    }, 20000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <aside
      aria-label="Personas en línea"
      className="order-first sticky top-0 z-[5] bg-[#0a0a0a] min-[900px]:order-none min-[900px]:fixed min-[900px]:top-[76px] min-[900px]:w-[200px] min-[900px]:bg-transparent right-[max(16px,calc((100vw_-_1080px)/2_+_16px))]"
    >
      <OnlineList people={people} inviteeName={inviteeName} onChallenge={onChallenge} loading={loading} meId={meId} />
    </aside>
  );
}

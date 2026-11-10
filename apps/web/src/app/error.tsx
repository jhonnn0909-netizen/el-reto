// Límite de error de la aplicación (ronda 3, defecto 1, red de
// seguridad): si un componente de cliente lanza una excepción al
// renderizar, Next.js muestra esta pantalla en vez de la página negra
// «Application error: a client-side exception has occurred», con un
// botón de reintento. NO sustituye a corregir la causa: la página del
// reto diario y las demás deben dejar de lanzar la excepción.
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, PageHeader } from '../components/ui';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Se registra para diagnosticar la causa sin exponer detalles al
    // usuario (el mensaje genérico no incluye la traza).
    // eslint-disable-next-line no-console
    console.error('Error de cliente en El Reto:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Algo salió mal" />
      <div role="alert" className="rounded-card border border-reto-error/50 bg-reto-error/10 p-4">
        <p className="text-sm">
          La página no pudo cargarse bien. Tu sesión y tus créditos no se han
          visto afectados: puedes intentarlo de nuevo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => reset()}>Reintentar</Button>
          <Link href="/retos">
            <Button variant="secondary">Ver retos</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary">Ir al inicio</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

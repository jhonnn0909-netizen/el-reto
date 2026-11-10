// Modal de confirmación (DESIGN.md §4): un solo propósito, título en
// forma de pregunta o acción, consecuencia en una frase, «Cancelar»
// a la izquierda y confirmación a la derecha. Escape cierra solo si
// no hay operación en curso.
'use client';

import { useEffect } from 'react';
import { Button } from './ui';

export default function Modal({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  busy = false,
  danger = false,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="animate-fade-in w-full max-w-md rounded-panel border border-reto-gold/40 bg-reto-elevated p-6 shadow-2xl"
      >
        <h2 id="modal-title" className="font-display text-xl font-bold">
          {title}
        </h2>
        <div className="mt-3 text-sm leading-relaxed text-white/70">{children}</div>
        <div className="mt-6 flex justify-between gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            autoFocus
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

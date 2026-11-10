// Aviso breve (toast, DESIGN.md §6): entra en 200 ms y desaparece
// a los 5 s. Nunca un modal para un éxito rutinario.
'use client';

import { useEffect } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export default function Toast({
  message,
  kind = 'success',
  onClose,
  actionLabel,
  onAction,
}: {
  message: string | null;
  kind?: ToastKind;
  onClose: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  const styles: Record<ToastKind, string> = {
    success: 'border-reto-success/50 bg-reto-surface text-reto-cream',
    error: 'border-reto-error/50 bg-reto-surface text-reto-cream',
    info: 'border-reto-info/50 bg-reto-surface text-reto-cream',
  };
  const icon: Record<ToastKind, string> = { success: '✓', error: '⚠', info: 'ℹ' };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`animate-fade-in fixed bottom-24 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-card border px-4 py-3 shadow-2xl md:bottom-8 ${styles[kind]}`}
    >
      <span aria-hidden="true" className="text-lg font-bold">
        {icon[kind]}
      </span>
      <p className="flex-1 text-sm">{message}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="text-sm font-semibold text-reto-gold underline underline-offset-2">
          {actionLabel}
        </button>
      )}
      <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="text-white/60 hover:text-reto-cream">
        ✕
      </button>
    </div>
  );
}

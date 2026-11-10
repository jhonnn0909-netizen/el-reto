// Primitivas de interfaz compartidas (DESIGN.md §4): botón, campo,
// tarjeta, insignia. Un solo aspecto en todas las pantallas.
'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      'bg-gradient-to-b from-reto-goldLight via-reto-gold to-reto-goldDark text-[#1a1206] shadow-[0_6px_22px_rgba(245,197,66,0.4)] hover:brightness-110 disabled:opacity-60',
    secondary: 'bg-white/[0.06] text-[#e8e8e8] border-[1.5px] border-reto-silver hover:bg-white/10 disabled:opacity-60',
    danger: 'bg-reto-error text-reto-cream hover:brightness-110 disabled:opacity-60',
    ghost: 'bg-transparent text-reto-gold underline underline-offset-2 hover:text-reto-cream disabled:opacity-60',
  };
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-reto-gold disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-card border border-reto-gold/40 bg-reto-surface p-4 ${className}`}>{children}</div>
  );
}

export function Field({
  label,
  id,
  error,
  hint,
  children,
}: {
  label: string;
  id: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-reto-cream">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-white/60">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 flex items-start gap-1 text-sm text-reto-error">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function TextInput({
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: string | null }) {
  return (
    <input
      className={`w-full rounded-lg border bg-reto-elevated px-3 py-2.5 text-base text-reto-cream placeholder:text-white/40 focus:border-reto-gold focus:outline-none ${
        error ? 'border-reto-error' : 'border-white/15'
      }`}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${props.id}-error` : props['aria-describedby']}
      {...props}
    />
  );
}

export function Badge({
  color,
  children,
  label,
}: {
  color: string;
  children: ReactNode;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}
      aria-label={label}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-black md:text-[28px]">{title}</h1>
      {subtitle && <p className="mt-1 text-sm leading-relaxed text-white/60">{subtitle}</p>}
    </header>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 font-display text-lg font-bold md:text-[22px]">{children}</h2>;
}

/** Inicial del avatar (doc 04 §5.1). */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-reto-goldLight via-reto-gold to-reto-goldDark font-display font-black text-reto-cream"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {initial}
    </span>
  );
}

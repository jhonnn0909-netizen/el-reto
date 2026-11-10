// Etiqueta DEMO y banner permanente de la billetera (DESIGN.md §8).
// Toda cifra de créditos lleva la etiqueta DEMO y el color reto.demo.
export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-reto-demo/25 px-2 py-0.5 text-[11px] font-bold tracking-wide text-reto-demo ring-1 ring-reto-demo/50">
      DEMO
    </span>
  );
}

export function DemoBanner() {
  return (
    <div
      role="note"
      className="rounded-card border border-reto-demo/40 bg-reto-demo/10 px-4 py-3 text-sm leading-relaxed text-reto-cream"
    >
      <strong>Billetera DEMO</strong> — Los créditos son virtuales y no tienen valor real. No se
      pueden cambiar por dinero.
    </div>
  );
}

export function DemoNotice() {
  return (
    <p role="note" className="rounded-card border border-reto-demo/40 bg-reto-demo/10 px-4 py-3 text-sm text-white/80">
      Los créditos son virtuales (<span className="font-semibold text-reto-demo">DEMO</span>), sin
      valor real. Aquí no se juega con dinero real.
    </p>
  );
}

// Centro de ayuda (DESIGN.md §9): buscador en vivo, temas en
// tarjetas, preguntas frecuentes con respuestas de máximo 3 frases y
// artículo con pasos numerados y «¿Te sirvió? Sí / No».
'use client';

import { useMemo, useState } from 'react';
import { Button, Field, PageHeader, SectionTitle, TextInput } from '../../components/ui';

const TOPICS = [
  { id: 'empezar', title: 'Empezar a jugar', description: 'Tu primera partida en menos de un minuto.' },
  { id: 'retos', title: 'Retos y partidas', description: 'Crear, aceptar y jugar retos en vivo.' },
  { id: 'demo', title: 'Créditos DEMO', description: 'Qué son y cómo conseguirlos.' },
  { id: 'cuenta', title: 'Mi cuenta y mi nombre', description: 'Registro, nombre de usuario y ranking.' },
  { id: 'conexion', title: 'Problemas de conexión', description: 'Qué pasa si se pierde la conexión.' },
  { id: 'seguridad', title: 'Seguridad', description: 'Contraseña, sesiones y cuenta.' },
] as const;

const FAQS: Array<{ topic: string; q: string; a: string }> = [
  { topic: 'empezar', q: '¿Necesito una cuenta para jugar?', a: 'No. Solo un nombre. La cuenta sirve para guardar tu ranking y tu historial.' },
  { topic: 'demo', q: '¿Qué son los créditos DEMO?', a: 'Créditos virtuales de prueba, sin valor real. No se pueden cambiar por dinero.' },
  { topic: 'retos', q: '¿Cómo sé que mi rival no copia mi jugada?', a: 'Las jugadas se sellan: ninguno ve la del otro hasta que los dos han elegido.' },
  { topic: 'conexion', q: '¿Qué hago si mi rival se desconecta?', a: 'La partida queda en pausa; puedes esperar o cancelarla. Nunca se declara una derrota por perder la conexión.' },
  { topic: 'cuenta', q: '¿Puedo cambiar mi nombre de usuario?', a: 'Sí, con confirmación, y solo si el nombre nuevo está libre.' },
  { topic: 'retos', q: '¿Cómo comparto un reto por WhatsApp?', a: 'Copia el enlace del reto y pégalo en el chat. Tu rival entra directo a la partida.' },
];

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);

  const results = useMemo(() => {
    let list = FAQS;
    if (topic !== 'ALL') list = list.filter((f) => f.topic === topic);
    if (query.trim().length >= 3) {
      const q = query.trim().toLowerCase();
      list = list.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
    }
    return list;
  }, [query, topic]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader title="Centro de ayuda" subtitle="Resuelve tu duda sin escribir a nadie." />
      <Field label="¿En qué te ayudamos?" id="help-search">
        <TextInput
          id="help-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca, por ejemplo, «créditos DEMO»"
          type="search"
        />
      </Field>

      <section aria-label="Temas">
        <SectionTitle>Temas</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setTopic('ALL')}
            aria-pressed={topic === 'ALL'}
            className={`rounded-card border p-4 text-left ${topic === 'ALL' ? 'border-reto-gold bg-reto-gold/10' : 'border-reto-gold/40 bg-reto-surface'}`}
          >
            <span className="font-display font-bold">Todos los temas</span>
            <span className="block text-sm text-white/60">Ver todas las preguntas.</span>
          </button>
          {TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTopic(t.id)}
              aria-pressed={topic === t.id}
              className={`rounded-card border p-4 text-left ${topic === t.id ? 'border-reto-gold bg-reto-gold/10' : 'border-reto-gold/40 bg-reto-surface'}`}
            >
              <span className="font-display font-bold">{t.title}</span>
              <span className="block text-sm text-white/60">{t.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Preguntas frecuentes">
        <SectionTitle>Preguntas frecuentes</SectionTitle>
        {results.length === 0 ? (
          <p role="status" className="rounded-card border border-reto-gold/40 bg-reto-surface p-4 text-sm text-white/70">
            No encontramos nada con ese filtro. Prueba con otra palabra o limpia la búsqueda.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((f) => (
              <li key={f.q} className="rounded-card border border-reto-gold/40 bg-reto-surface">
                <button
                  type="button"
                  onClick={() => setOpen(open === f.q ? null : f.q)}
                  aria-expanded={open === f.q}
                  className="w-full p-4 text-left font-semibold"
                >
                  {f.q}
                </button>
                {open === f.q && <p className="px-4 pb-4 text-sm leading-relaxed text-white/70">{f.a}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <article aria-label="Cómo jugar tu primera partida" className="rounded-card border border-reto-gold/40 bg-reto-surface p-5">
        <h2 className="font-display text-lg font-bold">Cómo jugar tu primera partida</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-white/70">
          <li>Escribe tu nombre. No necesitas correo ni contraseña.</li>
          <li>Crea un reto o acepta uno público de la lista.</li>
          <li>Comparte el enlace con tu rival si el reto es privado.</li>
          <li>Cuando suene la cuenta atrás, elige piedra, papel o tijera al mismo tiempo que tu rival.</li>
        </ol>
        <p className="mt-3 text-xs text-white/50">Actualizado en noviembre de 2026.</p>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm">¿Te sirvió?</span>
          <Button variant="secondary" className="min-h-[36px] px-3 py-1 text-xs" onClick={() => setFeedback('yes')} aria-pressed={feedback === 'yes'}>
            Sí
          </Button>
          <Button variant="secondary" className="min-h-[36px] px-3 py-1 text-xs" onClick={() => setFeedback('no')} aria-pressed={feedback === 'no'}>
            No
          </Button>
          {feedback && <span role="status" className="text-sm text-reto-success">Gracias por tu respuesta.</span>}
        </div>
      </article>
    </div>
  );
}

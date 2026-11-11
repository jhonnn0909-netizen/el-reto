// Última lista de personas en línea conocida (caché en memoria del
// módulo, sobrevive a la navegación dentro de la SPA).
// Al cambiar de página, el panel muestra esta lista de inmediato
// mientras se refresca, en vez de «(0)» o «Cargando personas en
// línea…» durante segundos aunque haya gente en línea.
// Solo se guarda una lista válida: si la API devolviera un objeto
// (p. ej. `{}` en un error), guardarlo haría fallar el panel
// (`people.map is not a function`) en la siguiente página.
import type { OnlinePerson } from './types';

let last: OnlinePerson[] | null = null;

export function getCachedPresence(): OnlinePerson[] | null {
  return Array.isArray(last) ? last : null;
}

export function setCachedPresence(people: OnlinePerson[]): void {
  if (!Array.isArray(people)) return;
  last = people;
}

/** Lista segura para el panel: solo un array válido pasa. */
export function asPresenceList(list: unknown): OnlinePerson[] {
  return Array.isArray(list) ? list : [];
}

import type { ResistanceFormat } from './parsers';
const KEY = 'skycycle.preferred-bike.v1';
export interface SavedBike { id?: string; name?: string; extraServices: string[]; resistanceFormat: ResistanceFormat; }
/** Local browser preference only. Never sent to diagnostic exports or a backend. */
export function getSavedBike(): SavedBike | undefined {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!data || (typeof data.id !== 'string' && typeof data.name !== 'string')) return;
    return { id: typeof data.id === 'string' ? data.id : undefined, name: typeof data.name === 'string' ? data.name : undefined,
      extraServices: Array.isArray(data.extraServices) ? data.extraServices.filter((s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s)) : [],
      resistanceFormat: data.resistanceFormat === 'legacy-ftms' ? 'legacy-ftms' : 'gss2026' };
  } catch { return; }
}
export function saveBike(bike: SavedBike): boolean {
  if (!bike.id && !bike.name) return false;
  try { localStorage.setItem(KEY, JSON.stringify(bike)); return true; } catch { return false; }
}
export function forgetBike() { try { localStorage.removeItem(KEY); } catch { /* Storage may be disabled. */ } }

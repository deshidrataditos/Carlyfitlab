import {catalog} from './catalog';

/** Public destinations only. Clinical answers stay in Google Forms. */
export const PLAN_INTAKE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSe8R-2yU10L_5zJBHjDpXgMyGCO-_IliGGPNmdGFnoQyuIpuw/viewform';
export const PLAN_ACCESS_URL = 'https://carlyfitlab.com/?account=1#comunidad';
export const CANONICAL_PLAN_IDS = catalog.filter(item => item.kind === 'plan' && item.available !== false).map(item => item.id);

export function hasCanonicalPlan(items: unknown): boolean {
  return Array.isArray(items) && items.some(item => item && typeof item === 'object' &&
    typeof item.id === 'string' && CANONICAL_PLAN_IDS.includes(item.id) && Number.isInteger(item.quantity) && item.quantity > 0);
}

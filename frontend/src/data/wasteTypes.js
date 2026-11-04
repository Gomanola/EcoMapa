/**
 * Waste type definitions with labels, icons, and map marker colors.
 * The `id` values must match the WASTE_TYPES array in the backend Lambda.
 */

export const WASTE_TYPES = [
  { id: 'metal',        label: 'Metal',         icon: '🔩', color: '#64748b' },
  { id: 'plastic',      label: 'Plástico',      icon: '♻️', color: '#3b82f6' },
  { id: 'glass',        label: 'Vidrio',       icon: '🍾', color: '#10b981' },
  { id: 'unicel',       label: 'Unicel',        icon: '⬜', color: '#f59e0b' },
  { id: 'cardboard',    label: 'Cartón',       icon: '📦', color: '#a16207' },
  { id: 'paper',        label: 'Papel',         icon: '📄', color: '#6366f1' },
  { id: 'organic',      label: 'Orgánico',     icon: '🍂', color: '#84cc16' },
  { id: 'battery',      label: 'Baterías',      icon: '🔋', color: '#ef4444' },
  { id: 'electronic',   label: 'Electrónica',   icon: '💻', color: '#8b5cf6' },
  { id: 'textile',      label: 'Textil',        icon: '👕', color: '#ec4899' },
  { id: 'oil',          label: 'Aceite',        icon: '🛢️', color: '#475569' },
  { id: 'tire',         label: 'Llantas',       icon: '🛞', color: '#1c1917' },
  { id: 'construction', label: 'Construcción',  icon: '🧱', color: '#92400e' },
];

export const PAYMENT_TYPES = [
  { id: 'pay',    label: 'Pagan',   color: '#22c55e' },
  { id: 'charge', label: 'Cobran',  color: '#ef4444' },
  { id: 'free',   label: 'Gratis',   color: '#3b82f6' },
  { id: 'none',   label: 'Sin info', color: '#94a3b8' },
];

export function getWasteType(id) {
  return WASTE_TYPES.find((t) => t.id === id);
}

export function getPaymentType(id) {
  return PAYMENT_TYPES.find((p) => p.id === id) || PAYMENT_TYPES[3];
}

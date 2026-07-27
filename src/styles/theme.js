export const COLORS = {
  bg: '#0a0a14',
  card: '#141823',
  cardHover: '#1a1f2e',
  border: '#2a3040',
  text: '#e6e7ee',
  muted: '#8a8fa3',
  danger: '#ff6b6b',
  warn: '#ffb454',
  ok: '#3ddc97',
  primary: '#4a9eff',
}

// Unified 4×8 palette shared by categories (work + personal) and by
// calendar event color overrides. Rows 1-3 are chromatic (light → medium →
// dark), each row ordered left-to-right red → orange → amber → green →
// teal → blue → indigo → purple. Row 4 is a white → black grayscale ramp.
export const UNIFIED_PALETTE = [
  // Row 1 — light
  '#fca5a5', '#fdba74', '#fcd34d', '#86efac', '#5eead4', '#93c5fd', '#a5b4fc', '#d8b4fe',
  // Row 2 — medium
  '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7',
  // Row 3 — dark
  '#b91c1c', '#c2410c', '#b45309', '#15803d', '#0f766e', '#1d4ed8', '#4338ca', '#7e22ce',
  // Row 4 — grayscale
  '#ffffff', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#1f2937', '#000000',
]

export const PALETTE_COLS = 8
export const PALETTE_ROWS = 4

// Kept for backward compat with any existing imports.
export const PALETTE = UNIFIED_PALETTE
export const WORK_PALETTE = UNIFIED_PALETTE
export const PERSONAL_PALETTE = UNIFIED_PALETTE

export function paletteFor() {
  return UNIFIED_PALETTE
}

export const STATUS_CYCLE = ['Not Started', 'In Progress', 'Done']
export const STATUS_LABEL = {
  'Not Started': 'Not Started',
  'In Progress': 'In Progress',
  Done: 'Done',
}
export const STATUS_COLOR = {
  'Not Started': '#8a8fa3',
  'In Progress': '#ffb454',
  Done: '#3ddc97',
}

export const UNCATEGORIZED = 'Uncategorized'

export const CATEGORY_COLOR = {
  work: COLORS.primary,
  personal: UNIFIED_PALETTE[11], // green-500
  holiday: '#e84057',
}

export function textOnColor(bg) {
  if (!/^#[0-9a-fA-F]{6}$/.test(bg)) return '#fff'
  const r = parseInt(bg.slice(1, 3), 16) / 255
  const g = parseInt(bg.slice(3, 5), 16) / 255
  const b = parseInt(bg.slice(5, 7), 16) / 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum > 0.6 ? '#0a0a14' : '#fff'
}

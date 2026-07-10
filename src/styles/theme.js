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

// WORK: saturated, high-contrast — for quickly telling categories apart
// in a busy pipeline.
export const WORK_PALETTE = [
  '#4a9eff', // blue
  '#4ecf7a', // green
  '#c47aff', // purple
  '#ffb454', // amber
  '#ff6b9d', // pink
  '#4ec9d4', // cyan
  '#ff8a65', // coral
  '#8a8fa3', // slate
]

// PERSONAL: muted / pastel — softer on the eyes for after-hours use.
export const PERSONAL_PALETTE = [
  '#8bb4d9', // muted blue
  '#a3d4a6', // sage
  '#c8a3d9', // lavender
  '#d9c39a', // sand
  '#d9a3b8', // dusty rose
  '#a3d0d4', // seafoam
  '#d9b298', // peach
  '#a8adb8', // grey mist
]

// Legacy alias — some callers may still import PALETTE unaware of the split.
export const PALETTE = WORK_PALETTE

export function paletteFor(scope) {
  return scope === 'personal' ? PERSONAL_PALETTE : WORK_PALETTE
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

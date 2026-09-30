import { COLORS } from '../styles/theme'

// STUDY left this bar in Phase 11 — it now lives as a 'Study' chip inside
// WORK (see Dashboard's showStudy prop).
const TABS = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'work',     label: 'WORK' },
  { id: 'personal', label: 'PERSONAL' },
]

// Decorate the label based on urgency marker.
// 'star' → ☆ LABEL (≤3 days), 'bang' → ! LABEL (≤7 days), null → LABEL.
function decorate(label, marker) {
  if (marker === 'star') return `☆ ${label}`
  if (marker === 'bang') return `! ${label}`
  return label
}

const MARKER_COLOR = {
  star: COLORS.danger,
  bang: COLORS.warn,
}

export function TabBar({ active, onChange, markers = {} }) {
  return (
    <nav style={S.bar}>
      {TABS.map(t => {
        const on = active === t.id
        const marker = markers[t.id]
        const urgentColor = MARKER_COLOR[marker]
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            ...S.btn,
            color: on ? COLORS.primary : (urgentColor || COLORS.muted),
            border: `1px solid ${COLORS.border}`,
            borderBottom: on ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
          }}>{decorate(t.label, marker)}</button>
        )
      })}
    </nav>
  )
}

const S = {
  bar: { position: 'fixed', left: 0, right: 0,
    top: 'calc(48px + env(safe-area-inset-top, 0px))',
    display: 'flex', justifyContent: 'space-around',
    background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`,
    zIndex: 50 },
  btn: { flex: 1, background: 'transparent',
    margin: '4px 4px 0', borderRadius: 8,
    padding: '10px 4px', fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
    cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
}

import { COLORS } from '../styles/theme'

const TABS = [
  { id: 'work',     label: 'WORK' },
  { id: 'personal', label: 'PERSONAL' },
  { id: 'config',   label: 'CONFIG' },
]

// Decorate the label based on urgency marker.
// 'star' → ☆ LABEL ☆ (≤3 days), 'bang' → ! LABEL ! (≤7 days), null → LABEL.
function decorate(label, marker) {
  if (marker === 'star') return `☆ ${label} ☆`
  if (marker === 'bang') return `! ${label} !`
  return label
}

const MARKER_COLOR = {
  star: COLORS.danger,
  bang: COLORS.warn,
}

export function TabBar({ active, onChange, markers = {} }) {
  return (
    <nav style={S.bar} className="safe-top">
      {TABS.map(t => {
        const on = active === t.id
        const marker = markers[t.id]
        const urgentColor = MARKER_COLOR[marker]
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            ...S.btn,
            color: on ? COLORS.primary : (urgentColor || COLORS.muted),
            borderBottom: on ? `2px solid ${COLORS.primary}` : '2px solid transparent',
          }}>{decorate(t.label, marker)}</button>
        )
      })}
    </nav>
  )
}

const S = {
  bar: { position: 'fixed', left: 0, right: 0, top: 48,
    display: 'flex', justifyContent: 'space-around',
    background: COLORS.card, borderBottom: `1px solid ${COLORS.border}`,
    zIndex: 50 },
  btn: { flex: 1, background: 'transparent', border: 0,
    padding: '14px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
    cursor: 'pointer' },
}

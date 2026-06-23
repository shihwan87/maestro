import { useState, useEffect } from 'react'
import { COLORS } from '../styles/theme'

// Hybrid date input: free-text typing + native picker button.
// Accepts YYYY-MM-DD, YY-MM-DD, YYYY/MM/DD, YY/MM/DD, YYYY.MM.DD.
// Picker is a real <input type="date"> overlaid on the button — taps land on
// the native control directly so iOS Safari opens the picker without needing
// showPicker() (which is unreliable across iOS versions / activation paths).
export function DateInput({ value, onChange, style }) {
  const [text, setText] = useState(value || '')

  useEffect(() => { setText(value || '') }, [value])

  const commit = () => {
    const norm = normalize(text)
    if (norm === null) {
      setText(value || '')
    } else if (norm !== (value || '')) {
      onChange(norm)
    }
  }

  return (
    <div style={{ ...S.wrap, ...style }}>
      <input type="text" inputMode="numeric"
        value={text}
        placeholder="YYYY-MM-DD"
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        style={S.text} />
      <span style={S.btnWrap}>
        <span style={S.btnIcon} aria-hidden="true">📅</span>
        <input type="date"
          value={value || ''}
          onChange={e => { setText(e.target.value); onChange(e.target.value || '') }}
          onClick={e => {
            // Desktop (Windows Chrome/Edge) needs showPicker() to open on a
            // click anywhere on the field; iOS opens on focus automatically.
            const el = e.currentTarget
            if (typeof el.showPicker === 'function') { try { el.showPicker() } catch {} }
          }}
          style={S.dateOverlay}
          aria-label="Open calendar" />
      </span>
    </div>
  )
}

function normalize(raw) {
  if (raw === undefined || raw === null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  // Pure digits (no separators): 8 = YYYYMMDD, 6 = YYMMDD. iOS numeric
  // keypad has no hyphen, so allow typing the digits straight through.
  if (/^\d+$/.test(s)) {
    if (s.length === 8) return normalize(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
    if (s.length === 6) return normalize(`${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`)
    return null
  }
  const parts = s.replace(/[./]/g, '-').split('-')
  if (parts.length !== 3) return null
  let [y, m, d] = parts
  if (!/^\d+$/.test(y) || !/^\d+$/.test(m) || !/^\d+$/.test(d)) return null
  if (y.length === 2) y = '20' + y
  if (y.length !== 4) return null
  m = m.padStart(2, '0')
  d = d.padStart(2, '0')
  const mi = parseInt(m, 10), di = parseInt(d, 10)
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null
  return `${y}-${m}-${d}`
}

const S = {
  wrap: { display: 'inline-flex', alignItems: 'stretch', gap: 0,
    border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden',
    background: COLORS.bg },
  text: { background: 'transparent', color: COLORS.text, border: 0, outline: 'none',
    padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', minWidth: 120 },
  btnWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', background: COLORS.card,
    borderLeft: `1px solid ${COLORS.border}`, padding: '0 12px', minWidth: 44,
    cursor: 'pointer' },
  btnIcon: { fontSize: 16, pointerEvents: 'none' },
  dateOverlay: { position: 'absolute', inset: 0, width: '100%', height: '100%',
    opacity: 0, border: 0, padding: 0, margin: 0, cursor: 'pointer',
    background: 'transparent', color: 'transparent', WebkitAppearance: 'none' },
}

import { useEffect, useRef, useState } from 'react'
import { COLORS, UNIFIED_PALETTE, PALETTE_COLS } from '../styles/theme'

// Compact color picker: a `Select color` button that reveals a 4×8 palette
// popover on click. Used by category and event editors.
// - value: current hex (string) or null
// - onChange: (hex|null) => void
// - allowClear: if true, render a first cell that clears to null (e.g.
//   "use category color" for event overrides). Default false.
// - clearLabel: tooltip for the clear cell. Default "Clear".
export function ColorPicker({ value, onChange, allowClear = false, clearLabel = 'Clear' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const pick = (c) => {
    onChange(c)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={S.wrap}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={S.btn}
      >
        <span style={{
          ...S.dot,
          background: value ?? 'transparent',
          border: value ? '1px solid rgba(0,0,0,0.15)' : `1px dashed ${COLORS.border}`,
        }} />
        <span>Select color</span>
      </button>
      {open && (
        <div style={S.pop} onClick={e => e.stopPropagation()}>
          <div style={S.grid}>
            {allowClear && (
              <button
                key="__clear"
                type="button"
                onClick={() => pick(null)}
                title={clearLabel}
                style={{
                  ...S.cell,
                  background: 'transparent',
                  border: value === null ? `2px solid ${COLORS.text}` : `1px dashed ${COLORS.border}`,
                  color: COLORS.muted,
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >✕</button>
            )}
            {UNIFIED_PALETTE.map(c => {
              const selected = value === c
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(c)}
                  style={{
                    ...S.cell,
                    background: c,
                    border: selected ? `2px solid ${COLORS.text}` : `1px solid ${COLORS.border}`,
                  }}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

const CELL = 24
const GAP = 6

const S = {
  wrap: { position: 'relative', display: 'inline-block' },
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: COLORS.card, color: COLORS.text,
    border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: '6px 10px', fontSize: 13, cursor: 'pointer',
  },
  dot: { width: 14, height: 14, borderRadius: 4, flexShrink: 0 },
  pop: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
    background: COLORS.card, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: 10, zIndex: 200,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: `repeat(${PALETTE_COLS}, ${CELL}px)`,
    gap: GAP,
  },
  cell: {
    width: CELL, height: CELL, borderRadius: 4, cursor: 'pointer', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
}

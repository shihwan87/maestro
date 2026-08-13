import { useState } from 'react'
import { COLORS } from '../styles/theme'

// Overlay PIN re-entry, extracted from the inline version that used to live
// only in TrustedDeviceManager.jsx — now also used by DailyNotesView for its
// entry and edit/delete confirmations. Purely a PIN check against
// VITE_APP_PIN; caller decides what "verified" unlocks.
export function PinConfirmModal({ title, subtitle = 'Enter PIN to continue', onVerified, onCancel }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (pin === import.meta.env.VITE_APP_PIN) {
      onVerified()
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <h2 style={S.h2}>{title}</h2>
        <p style={S.sub}>{subtitle}</p>
        <form onSubmit={submit}>
          <input
            type="password" inputMode="numeric" autoFocus
            value={pin} onChange={e => { setPin(e.target.value); setError(false) }}
            style={{ ...S.input, borderColor: error ? COLORS.danger : COLORS.border }}
          />
          {error && <p style={S.err}>Wrong PIN</p>}
          <div style={S.row}>
            {onCancel && <button type="button" onClick={onCancel} style={S.cancelBtn}>Cancel</button>}
            <button type="submit" style={S.primaryBtn}>Verify</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center',
    padding: 16,
  },
  modal: {
    background: COLORS.card, borderRadius: 16, padding: 24,
    width: '100%', maxWidth: 340,
  },
  h2: { fontSize: 18, fontWeight: 600, color: COLORS.text, margin: '0 0 8px' },
  sub: { color: COLORS.muted, fontSize: 13, margin: '0 0 12px' },
  input: {
    width: '100%', padding: '10px 12px', fontSize: 15,
    background: COLORS.bg, color: COLORS.text,
    border: `1px solid ${COLORS.border}`, borderRadius: 8, outline: 'none',
    boxSizing: 'border-box',
  },
  err: { color: COLORS.danger, fontSize: 13, margin: '6px 0 0' },
  row: { display: 'flex', gap: 8, marginTop: 12 },
  primaryBtn: {
    background: COLORS.primary, color: '#fff', border: 0, borderRadius: 8,
    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  cancelBtn: {
    background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
  },
}

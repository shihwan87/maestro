import { useState, useEffect } from 'react'
import { COLORS } from '../styles/theme'

const KEY = 'schemanager.unlocked'

export function PinGate({ children }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(KEY) === '1')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (unlocked) sessionStorage.setItem(KEY, '1')
  }, [unlocked])

  if (unlocked) return children

  const submit = (e) => {
    e.preventDefault()
    if (pin === import.meta.env.VITE_APP_PIN) {
      setUnlocked(true); setError(false)
    } else {
      setError(true); setPin('')
    }
  }

  return (
    <div style={S.wrap} className="safe-top safe-bottom">
      <form onSubmit={submit} style={S.box}>
        <h1 style={S.title}>Schemanager</h1>
        <p style={S.sub}>Enter PIN</p>
        <input
          type="password" inputMode="numeric" autoFocus
          value={pin} onChange={e => { setPin(e.target.value); setError(false) }}
          style={{ ...S.input, borderColor: error ? COLORS.danger : COLORS.border }}
        />
        {error && <p style={S.err}>Wrong PIN</p>}
        <button type="submit" style={S.btn}>Unlock</button>
      </form>
    </div>
  )
}

const S = {
  wrap: { minHeight: '100vh', background: COLORS.bg, display: 'grid', placeItems: 'center',
    paddingLeft: 16, paddingRight: 16 },
  box: { background: COLORS.card, borderRadius: 16, padding: 32, width: '100%', maxWidth: 320, textAlign: 'center' },
  title: { color: COLORS.text, fontSize: 24, fontWeight: 600, margin: 0, marginBottom: 8 },
  sub: { color: COLORS.muted, fontSize: 14, margin: 0, marginBottom: 20 },
  input: { width: '100%', padding: '12px 14px', fontSize: 20, textAlign: 'center', letterSpacing: 8,
    background: COLORS.bg, color: COLORS.text, border: '1px solid', borderRadius: 10, outline: 'none' },
  err: { color: COLORS.danger, fontSize: 13, margin: '8px 0 0' },
  btn: { width: '100%', marginTop: 16, padding: '12px', fontSize: 14, fontWeight: 600,
    background: COLORS.primary, color: '#fff', border: 0, borderRadius: 10, cursor: 'pointer' },
}

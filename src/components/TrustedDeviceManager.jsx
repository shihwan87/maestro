import { useState, useEffect, useCallback } from 'react'
import { COLORS } from '../styles/theme'
import { supabase } from '../lib/supabase'
import { getOrCreateDeviceToken } from '../lib/deviceFingerprint'
import { PinConfirmModal } from './PinConfirmModal'

export function TrustedDeviceManager({ onClose }) {
  const [pinVerified, setPinVerified] = useState(false)
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [nickname, setNickname] = useState('')
  const [editId, setEditId] = useState(null)
  const [editNick, setEditNick] = useState('')
  const [confirmRemoveId, setConfirmRemoveId] = useState(null)

  const currentToken = getOrCreateDeviceToken()

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('trusted_devices')
      .select('*')
      .order('created_at', { ascending: false })
    setDevices(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (pinVerified) fetchDevices()
  }, [pinVerified, fetchDevices])

  const addCurrent = async () => {
    const nick = nickname.trim()
    if (!nick) return
    await supabase.from('trusted_devices').upsert(
      { device_token: currentToken, nickname: nick, last_seen_at: new Date().toISOString() },
      { onConflict: 'device_token' }
    )
    setNickname('')
    fetchDevices()
  }

  const updateNickname = async (id) => {
    const nick = editNick.trim()
    if (!nick) return
    await supabase.from('trusted_devices').update({ nickname: nick }).eq('id', id)
    setEditId(null)
    setEditNick('')
    fetchDevices()
  }

  const removeDevice = async (id) => {
    await supabase.from('trusted_devices').delete().eq('id', id)
    setConfirmRemoveId(null)
    fetchDevices()
  }

  if (!pinVerified) {
    return (
      <PinConfirmModal
        title="Manage Trusted Devices"
        subtitle="Re-enter PIN to continue"
        onVerified={() => setPinVerified(true)}
        onCancel={onClose}
      />
    )
  }

  const currentIsTrusted = devices.some(d => d.device_token === currentToken)

  return (
    <div style={S.overlay}>
      <div style={{ ...S.modal, maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ ...S.h2, margin: 0 }}>Trusted Devices</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        {!currentIsTrusted && (
          <div style={S.addBox}>
            <p style={S.sub}>Trust this device?</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                placeholder="Device nickname"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                style={{ ...S.input, flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && addCurrent()}
              />
              <button onClick={addCurrent} disabled={!nickname.trim()} style={S.primaryBtn}>Add</button>
            </div>
          </div>
        )}

        {loading && <p style={S.sub}>Loading…</p>}

        {devices.length === 0 && !loading && (
          <p style={S.sub}>No trusted devices yet.</p>
        )}

        <ul style={S.list}>
          {devices.map(d => {
            const isCurrent = d.device_token === currentToken
            const isEditing = editId === d.id
            const isConfirming = confirmRemoveId === d.id
            return (
              <li key={d.id} style={S.item}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                      <input
                        value={editNick} onChange={e => setEditNick(e.target.value)}
                        style={{ ...S.input, flex: 1, fontSize: 13 }}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') updateNickname(d.id)
                          if (e.key === 'Escape') setEditId(null)
                        }}
                      />
                      <button onClick={() => updateNickname(d.id)} style={S.smallBtn}>Save</button>
                      <button onClick={() => setEditId(null)} style={S.smallBtn}>✕</button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>
                          {d.nickname}
                        </span>
                        {isCurrent && (
                          <span style={S.currentBadge}>this device</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setEditId(d.id); setEditNick(d.nickname) }} style={S.smallBtn}>Edit</button>
                        {isConfirming ? (
                          <>
                            <button onClick={() => removeDevice(d.id)} style={{ ...S.smallBtn, color: COLORS.danger, borderColor: COLORS.danger }}>Confirm</button>
                            <button onClick={() => setConfirmRemoveId(null)} style={S.smallBtn}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmRemoveId(d.id)} style={S.smallBtn}>Remove</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div style={S.meta}>
                  Added {new Date(d.created_at).toLocaleDateString()}
                  {' · '}
                  Last seen {new Date(d.last_seen_at).toLocaleDateString()}
                </div>
              </li>
            )
          })}
        </ul>
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
  primaryBtn: {
    background: COLORS.primary, color: '#fff', border: 0, borderRadius: 8,
    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  cancelBtn: {
    background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
  },
  closeBtn: {
    background: 'transparent', border: 'none', color: COLORS.muted,
    fontSize: 18, cursor: 'pointer', padding: 4,
  },
  addBox: {
    background: COLORS.bg, borderRadius: 10, padding: 12, marginBottom: 12,
    border: `1px dashed ${COLORS.border}`,
  },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    background: COLORS.bg, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: 10,
  },
  smallBtn: {
    background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.border}`,
    borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12,
  },
  currentBadge: {
    marginLeft: 8, fontSize: 10, fontWeight: 600, color: COLORS.primary,
    background: `${COLORS.primary}22`, padding: '2px 6px', borderRadius: 4,
    textTransform: 'uppercase',
  },
  meta: { color: COLORS.muted, fontSize: 11, marginTop: 6 },
}

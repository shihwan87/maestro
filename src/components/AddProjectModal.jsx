import { useState, useEffect } from 'react'
import { COLORS } from '../styles/theme'
import { DateInput } from './DateInput'

const PRIORITY_OPTS = [
  { value: 'high', label: 'High', color: '#ff5b6e' },
  { value: 'mid',  label: 'Mid',  color: '#f7b955' },
  { value: 'low',  label: 'Low',  color: '#6b7280' },
]

export function AddProjectModal({ open, initial, categories, itemNoun = 'Project', onClose, onSave, onDelete }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState('mid')
  const [confirmDel, setConfirmDel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || '')
      setCategory(initial?.category || categories[0]?.name || '')
      setDeadline(initial?.deadline || '')
      setPriority(initial?.priority || 'mid')
      setConfirmDel(false); setErr(null)
    }
  }, [open, initial, categories])

  if (!open) return null
  const editing = !!initial

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true); setErr(null)
    try {
      await onSave({ title: title.trim(), category, deadline: deadline || null, priority })
      onClose()
    } catch (e) { setErr(e.message || String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={S.modal}>
        <h2 style={S.title}>{editing ? `Edit ${itemNoun}` : `New ${itemNoun}`}</h2>

        <label style={S.label}>Title</label>
        <input style={S.input} value={title} onChange={e => setTitle(e.target.value)}
          placeholder={`${itemNoun} title`} autoFocus />

        <label style={S.label}>Category</label>
        <div style={S.catRow}>
          {categories.map(c => {
            const selected = category === c.name
            return (
              <button key={c.id} type="button" onClick={() => setCategory(c.name)}
                style={{
                  ...S.catBtn,
                  borderColor: selected ? c.color : COLORS.border,
                  color: selected ? c.color : COLORS.muted,
                  background: selected ? `${c.color}15` : 'transparent',
                }}>
                <span style={{ ...S.swatch, background: c.color }} />
                {c.name}
              </button>
            )
          })}
        </div>

        <label style={S.label}>Priority</label>
        <div style={S.catRow}>
          {PRIORITY_OPTS.map(o => {
            const selected = priority === o.value
            return (
              <button key={o.value} type="button" onClick={() => setPriority(o.value)}
                style={{
                  ...S.catBtn,
                  borderColor: selected ? o.color : COLORS.border,
                  color: selected ? o.color : COLORS.muted,
                  background: selected ? `${o.color}15` : 'transparent',
                }}>
                <span style={{ ...S.swatch, background: o.color }} />
                {o.label}
              </button>
            )
          })}
        </div>

        <label style={S.label}>Planned deadline</label>
        <DateInput value={deadline} onChange={setDeadline} />

        {err && <p style={S.err}>{err}</p>}

        <div style={S.actions}>
          {editing && !confirmDel && (
            <button type="button" style={S.delBtn} onClick={() => setConfirmDel(true)}>Delete</button>
          )}
          {editing && confirmDel && (
            <button type="button" style={S.delConfirm}
              onClick={async () => { await onDelete(initial.id); onClose() }}>
              Really delete?
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" style={S.cancel} onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving} style={S.save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'grid', placeItems: 'center', padding: 16, zIndex: 100 },
  modal: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16,
    padding: 24, width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 6 },
  title: { color: COLORS.text, fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 12 },
  label: { color: COLORS.muted, fontSize: 12, marginTop: 8 },
  input: { background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none' },
  catRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  catBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px',
    borderRadius: 999, border: '1px solid', background: 'transparent',
    cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  swatch: { width: 10, height: 10, borderRadius: 99 },
  err: { color: COLORS.danger, fontSize: 13, marginTop: 8 },
  actions: { display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' },
  delBtn: { background: 'transparent', color: COLORS.danger, border: `1px solid ${COLORS.danger}`,
    borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 },
  delConfirm: { background: COLORS.danger, color: '#fff', border: 0, borderRadius: 8,
    padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  cancel: { background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 },
  save: { background: COLORS.primary, color: '#fff', border: 0, borderRadius: 8,
    padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
}

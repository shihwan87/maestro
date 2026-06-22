import { useState, useEffect } from 'react'
import { COLORS, CATEGORIES, CATEGORY_LABEL } from '../styles/theme'

export function AddProjectModal({ open, initial, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('ICU/Clinical')
  const [deadline, setDeadline] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (open) {
      setTitle(initial?.title || '')
      setCategory(initial?.category || 'ICU/Clinical')
      setDeadline(initial?.deadline || '')
      setConfirmDel(false); setErr(null)
    }
  }, [open, initial])

  if (!open) return null
  const editing = !!initial

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true); setErr(null)
    try {
      await onSave({ title: title.trim(), category, deadline: deadline || null })
      onClose()
    } catch (e) { setErr(e.message || String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={S.modal}>
        <h2 style={S.title}>{editing ? '프로젝트 수정 / Edit Project' : '새 프로젝트 / New Project'}</h2>

        <label style={S.label}>제목 / Title</label>
        <input style={S.input} value={title} onChange={e => setTitle(e.target.value)} autoFocus />

        <label style={S.label}>분류 / Category</label>
        <div style={S.catRow}>
          {CATEGORIES.map(c => (
            <button key={c} type="button" onClick={() => setCategory(c)}
              style={{
                ...S.catBtn,
                borderColor: category === c ? COLORS[c] : COLORS.border,
                color: category === c ? COLORS[c] : COLORS.muted,
                background: category === c ? `${COLORS[c]}15` : 'transparent',
              }}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        <label style={S.label}>마감일 / Deadline</label>
        <input style={S.input} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />

        {err && <p style={S.err}>{err}</p>}

        <div style={S.actions}>
          {editing && !confirmDel && (
            <button type="button" style={S.delBtn} onClick={() => setConfirmDel(true)}>삭제 / Delete</button>
          )}
          {editing && confirmDel && (
            <button type="button" style={S.delConfirm}
              onClick={async () => { await onDelete(initial.id); onClose() }}>
              정말 삭제? / Really delete?
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" style={S.cancel} onClick={onClose}>취소 / Cancel</button>
          <button type="submit" disabled={saving} style={S.save}>
            {saving ? '저장 중… / Saving…' : '저장 / Save'}
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
  catBtn: { padding: '8px 12px', borderRadius: 999, border: '1px solid', background: 'transparent',
    cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  err: { color: COLORS.danger, fontSize: 13, marginTop: 8 },
  actions: { display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' },
  delBtn: { background: 'transparent', color: COLORS.danger, border: `1px solid ${COLORS.danger}`,
    borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 },
  delConfirm: { background: COLORS.danger, color: '#fff', border: 0, borderRadius: 8,
    padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  cancel: { background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 },
  save: { background: COLORS['ICU/Clinical'], color: '#fff', border: 0, borderRadius: 8,
    padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
}

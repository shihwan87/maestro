import { useState } from 'react'
import { COLORS, PALETTE, UNCATEGORIZED } from '../styles/theme'

export function CategoryManager({ open, onClose, categories, onAdd, onUpdate, onDelete }) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PALETTE[0])
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [err, setErr] = useState(null)

  if (!open) return null

  const submitNew = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setErr(null)
    try {
      await onAdd({ name: newName.trim(), color: newColor })
      setNewName(''); setNewColor(PALETTE[0])
    } catch (e) { setErr(e.message || String(e)) }
  }

  const startEdit = (c) => {
    setEditingId(c.id); setEditName(c.name); setEditColor(c.color); setErr(null)
  }

  const saveEdit = async () => {
    if (!editName.trim()) return
    try {
      await onUpdate(editingId, { name: editName.trim(), color: editColor })
      setEditingId(null)
    } catch (e) { setErr(e.message || String(e)) }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={S.modal}>
        <div style={S.head}>
          <h2 style={S.title}>Manage Categories</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        <div style={S.list}>
          {categories.map(c => {
            const isUncat = c.name === UNCATEGORIZED
            const isEditing = editingId === c.id
            const isConfirming = confirmDel === c.id
            return (
              <div key={c.id} style={S.row}>
                {isEditing ? (
                  <>
                    <Swatches value={editColor} onChange={setEditColor} />
                    <input style={S.input} value={editName} onChange={e => setEditName(e.target.value)} />
                    <button onClick={saveEdit} style={S.save}>Save</button>
                    <button onClick={() => setEditingId(null)} style={S.cancel}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span style={{ ...S.dot, background: c.color }} />
                    <span style={S.name}>{c.name}</span>
                    {!isUncat && !isConfirming && (
                      <>
                        <button onClick={() => startEdit(c)} style={S.edit}>Edit</button>
                        <button onClick={() => setConfirmDel(c.id)} style={S.del}>Delete</button>
                      </>
                    )}
                    {!isUncat && isConfirming && (
                      <>
                        <button onClick={async () => { await onDelete(c.id); setConfirmDel(null) }} style={S.delConfirm}>
                          Reassign projects → Uncategorized
                        </button>
                        <button onClick={() => setConfirmDel(null)} style={S.cancel}>Cancel</button>
                      </>
                    )}
                    {isUncat && <span style={S.builtIn}>(fallback)</span>}
                  </>
                )}
              </div>
            )
          })}
        </div>

        <form onSubmit={submitNew} style={S.addBlock}>
          <div style={S.addHead}>Add new category</div>
          <div style={S.addRow}>
            <Swatches value={newColor} onChange={setNewColor} />
            <input style={S.input} value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Category name" />
            <button type="submit" style={S.addBtn}>+ Add</button>
          </div>
        </form>

        {err && <p style={S.err}>{err}</p>}
      </div>
    </div>
  )
}

function Swatches({ value, onChange }) {
  return (
    <div style={SW.row}>
      {PALETTE.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)}
          style={{
            ...SW.swatch,
            background: c,
            outline: value === c ? `2px solid ${COLORS.text}` : '0',
            outlineOffset: 1,
          }} />
      ))}
    </div>
  )
}

const SW = {
  row: { display: 'flex', gap: 4 },
  swatch: { width: 18, height: 18, border: 0, borderRadius: 4, cursor: 'pointer' },
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'grid', placeItems: 'center', padding: 16, zIndex: 110 },
  modal: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16,
    padding: 0, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottom: `1px solid ${COLORS.border}` },
  title: { color: COLORS.text, fontSize: 18, fontWeight: 600, margin: 0 },
  closeBtn: { background: 'transparent', color: COLORS.muted, border: 0, fontSize: 18,
    cursor: 'pointer', padding: '0 6px' },
  list: { padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10, background: COLORS.bg,
    padding: '10px 12px', borderRadius: 10, flexWrap: 'wrap' },
  dot: { width: 18, height: 18, borderRadius: 4, flexShrink: 0 },
  name: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: 500 },
  builtIn: { color: COLORS.muted, fontSize: 11 },
  edit: { background: 'transparent', color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  del: { background: 'transparent', color: COLORS.danger, border: `1px solid ${COLORS.danger}`,
    borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  delConfirm: { background: COLORS.danger, color: '#fff', border: 0, borderRadius: 6,
    padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  save: { background: COLORS.primary, color: '#fff', border: 0, borderRadius: 6,
    padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  cancel: { background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.border}`,
    borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  input: { flex: 1, minWidth: 100, background: COLORS.card, color: COLORS.text,
    border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '6px 10px',
    fontSize: 14, outline: 'none' },
  addBlock: { padding: 16, borderTop: `1px solid ${COLORS.border}` },
  addHead: { color: COLORS.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8 },
  addRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  addBtn: { background: COLORS.primary, color: '#fff', border: 0, borderRadius: 8,
    padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  err: { color: COLORS.danger, fontSize: 13, padding: '0 16px 16px', margin: 0 },
}

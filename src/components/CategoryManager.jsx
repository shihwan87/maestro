import { useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { COLORS, paletteFor, UNCATEGORIZED } from '../styles/theme'
import { ARCHIVED } from '../lib/constants'

export function CategoryManager({ open, onClose, categories, scope = 'work',
  onAdd, onUpdate, onDelete, onReorder }) {
  const palette = paletteFor(scope)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(palette[0])
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [err, setErr] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  if (!open) return null

  const submitNew = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setErr(null)
    try {
      await onAdd({ name: newName.trim(), color: newColor })
      setNewName(''); setNewColor(palette[0])
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

  const onDragEnd = async (e) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = categories.findIndex(c => c.id === active.id)
    const newIdx = categories.findIndex(c => c.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(categories, oldIdx, newIdx)
    await onReorder(reordered.map(c => c.id))
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={S.modal}>
        <div style={S.head}>
          <h2 style={S.title}>Manage Categories</h2>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        <div style={S.list}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {categories.map(c => (
                <CategoryRow key={c.id}
                  category={c}
                  palette={palette}
                  isEditing={editingId === c.id}
                  isConfirming={confirmDel === c.id}
                  editName={editName} editColor={editColor}
                  setEditName={setEditName} setEditColor={setEditColor}
                  onStartEdit={() => startEdit(c)}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onAskDelete={() => setConfirmDel(c.id)}
                  onCancelDelete={() => setConfirmDel(null)}
                  onConfirmDelete={async () => { await onDelete(c.id); setConfirmDel(null) }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <form onSubmit={submitNew} style={S.addBlock}>
          <div style={S.addHead}>Add new category</div>
          <div style={S.addRow}>
            <Swatches palette={palette} value={newColor} onChange={setNewColor} />
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

function CategoryRow({
  category: c, palette, isEditing, isConfirming,
  editName, editColor, setEditName, setEditColor,
  onStartEdit, onSaveEdit, onCancelEdit,
  onAskDelete, onCancelDelete, onConfirmDelete,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: c.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }
  const isReserved = c.name === UNCATEGORIZED || c.name === ARCHIVED

  return (
    <div ref={setNodeRef} style={{ ...S.row, ...style }}>
      <span {...attributes} {...listeners} style={S.handle} title="Drag to reorder">⋮⋮</span>
      {isEditing ? (
        <>
          <Swatches palette={palette} value={editColor} onChange={setEditColor} />
          <input style={S.input} value={editName} onChange={e => setEditName(e.target.value)} />
          <button onClick={onSaveEdit} style={S.save}>Save</button>
          <button onClick={onCancelEdit} style={S.cancel}>Cancel</button>
        </>
      ) : (
        <>
          <span style={{ ...S.dot, background: c.color }} />
          <span style={S.name}>{c.name}</span>
          {!isReserved && !isConfirming && (
            <>
              <button onClick={onStartEdit} style={S.edit}>Edit</button>
              <button onClick={onAskDelete} style={S.del}>Delete</button>
            </>
          )}
          {!isReserved && isConfirming && (
            <>
              <button onClick={onConfirmDelete} style={S.delConfirm}>
                Reassign projects → Uncategorized
              </button>
              <button onClick={onCancelDelete} style={S.cancel}>Cancel</button>
            </>
          )}
          {c.name === UNCATEGORIZED && <span style={S.builtIn}>(fallback)</span>}
          {c.name === ARCHIVED && <span style={S.builtIn}>(auto)</span>}
        </>
      )}
    </div>
  )
}

function Swatches({ palette, value, onChange }) {
  return (
    <div style={SW.row}>
      {palette.map(c => (
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
  handle: { color: COLORS.muted, fontSize: 14, cursor: 'grab', userSelect: 'none',
    touchAction: 'none', padding: '0 2px' },
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

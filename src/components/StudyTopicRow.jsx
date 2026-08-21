import { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { COLORS } from '../styles/theme'

const INDENT_WIDTH = 22

export function StudyTopicRow({
  node, depth, hasChildren, collapsed, onToggleCollapse,
  onUpdate, onDelete, onIndent, onOutdent, onAddChild, canIndent, canOutdent,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id })

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(node.title || '')
  const [notesOpen, setNotesOpen] = useState(!!(node.notes && node.notes.trim()))
  const [notes, setNotes] = useState(node.notes || '')
  const [addingChild, setAddingChild] = useState(false)
  const [childDraft, setChildDraft] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => { setTitleDraft(node.title || '') }, [node.title])
  useEffect(() => { setNotes(node.notes || '') }, [node.notes])

  const notesDirty = notes !== (node.notes || '')

  const saveTitle = async () => {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (t && t !== node.title) await onUpdate(node.id, { title: t })
    else setTitleDraft(node.title || '')
  }

  const saveNotes = async () => {
    if (notes !== (node.notes || '')) await onUpdate(node.id, { notes })
  }

  const submitChild = async (e) => {
    e.preventDefault()
    if (!childDraft.trim()) return
    await onAddChild(node.id, childDraft.trim())
    setChildDraft(''); setAddingChild(false)
  }

  return (
    <div ref={setNodeRef} style={{ ...S.wrap, ...dragStyle, paddingLeft: depth * INDENT_WIDTH }}>
      <div style={S.row}>
        <span {...attributes} {...listeners} style={S.handle} title="Drag to reorder or reparent">⋮⋮</span>

        <button onClick={() => hasChildren && onToggleCollapse(node.id)} style={S.chevron}
          title={hasChildren ? (collapsed ? 'Expand' : 'Collapse') : undefined}>
          {hasChildren ? (collapsed ? '▸' : '▾') : ''}
        </button>

        {editingTitle ? (
          <input autoFocus value={titleDraft} onClick={e => e.stopPropagation()}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); saveTitle() }
              if (e.key === 'Escape') { setTitleDraft(node.title || ''); setEditingTitle(false) }
            }}
            style={S.titleInput} />
        ) : (
          <span style={S.title} onClick={() => setEditingTitle(true)}>{node.title}</span>
        )}

        <button onClick={onOutdent} disabled={!canOutdent} style={{ ...S.iconBtn, opacity: canOutdent ? 1 : 0.3 }}
          title="Move to broader category">←</button>
        <button onClick={onIndent} disabled={!canIndent} style={{ ...S.iconBtn, opacity: canIndent ? 1 : 0.3 }}
          title="Move to narrower category (nest under item above)">→</button>
        <button onClick={() => setAddingChild(v => !v)} style={S.iconBtn} title="Add subtopic">+</button>
        <button onClick={() => setNotesOpen(v => !v)} style={S.iconBtn} title="Notes">✎</button>
        {!confirmDel && <button onClick={() => setConfirmDel(true)} style={S.delBtn} title="Delete">✕</button>}
        {confirmDel && (
          <>
            <button onClick={async () => { await onDelete(node.id); setConfirmDel(false) }} style={S.delConfirm}>
              Really delete?
            </button>
            <button onClick={() => setConfirmDel(false)} style={S.cancelBtn}>Cancel</button>
          </>
        )}
      </div>

      {notesOpen && (
        <div style={S.notesBlock}>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
            style={S.notes} rows={3} placeholder="Notes…" />
          {notesDirty && <button onClick={saveNotes} style={S.notesSave}>Save</button>}
        </div>
      )}

      {addingChild && (
        <form onSubmit={submitChild} style={S.childForm}>
          <input autoFocus value={childDraft} onChange={e => setChildDraft(e.target.value)}
            placeholder="New subtopic title" style={S.childInput} />
          <button type="submit" style={S.childAddBtn}>+ Add</button>
        </form>
      )}
    </div>
  )
}

const S = {
  wrap: { borderBottom: `1px solid ${COLORS.border}` },
  row: { display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', flexWrap: 'wrap' },
  handle: { color: COLORS.muted, fontSize: 14, cursor: 'grab', userSelect: 'none',
    touchAction: 'none', padding: '0 2px' },
  chevron: { background: 'transparent', color: COLORS.muted, border: 0, cursor: 'pointer',
    fontSize: 13, width: 18, minHeight: 30, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0 },
  title: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: 500, cursor: 'pointer',
    minWidth: 100, padding: '2px 2px' },
  titleInput: { flex: 1, minWidth: 100, background: COLORS.card, color: COLORS.text,
    border: `1px solid ${COLORS.primary}`, borderRadius: 8, padding: '4px 10px',
    fontSize: 14, fontWeight: 500, outline: 'none', fontFamily: 'inherit' },
  iconBtn: { background: 'transparent', color: COLORS.muted, border: 0, cursor: 'pointer',
    fontSize: 15, lineHeight: 1, padding: 4, minWidth: 30, minHeight: 30,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  delBtn: { background: 'transparent', color: COLORS.danger, border: 0, cursor: 'pointer',
    fontSize: 14, padding: 4, minWidth: 30, minHeight: 30, flexShrink: 0 },
  delConfirm: { background: COLORS.danger, color: '#fff', border: 0, borderRadius: 8,
    padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  cancelBtn: { background: 'transparent', color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12 },
  notesBlock: { padding: '0 4px 6px', display: 'flex', flexDirection: 'column', gap: 4 },
  notes: { background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: 8, fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit' },
  notesSave: { alignSelf: 'flex-start', background: COLORS.primary, color: '#fff', border: 0,
    borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  childForm: { display: 'flex', gap: 6, padding: '0 4px 6px' },
  childInput: { flex: 1, background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' },
  childAddBtn: { background: COLORS.border, color: COLORS.text, border: 0, borderRadius: 8,
    padding: '6px 10px', cursor: 'pointer', fontSize: 12 },
}

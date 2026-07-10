import { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { COLORS, STATUS_CYCLE, STATUS_LABEL, STATUS_COLOR } from '../styles/theme'
import { useSubtasks } from '../hooks/useSubtasks'
import { deadlineBadge, formatYYMMDD } from '../lib/format'
import { DateInput } from './DateInput'
import { MoveToScheduleButton } from './MoveToScheduleButton'

export function StepCard({ step, onUpdate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id })

  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }

  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(step.notes || '')
  // Notes panel: collapsed by default when there's no saved content, open
  // automatically if the step already has notes so a reader can see them
  // without extra taps.
  const [notesOpen, setNotesOpen] = useState(!!(step.notes && step.notes.trim()))
  const [deadline, setDeadline] = useState(step.deadline || '')
  const [newSub, setNewSub] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(step.title || '')
  const [editingSub, setEditingSub] = useState(null)   // subtask id being renamed
  const [subDraft, setSubDraft] = useState('')
  const { subtasks, addSubtask, updateSubtask, deleteSubtask, refresh } = useSubtasks(expanded ? step.id : null)

  useEffect(() => { setNotes(step.notes || '') }, [step.notes])
  useEffect(() => { setNotesOpen(!!(step.notes && step.notes.trim())) }, [step.notes])
  useEffect(() => { setDeadline(step.deadline || '') }, [step.deadline])
  useEffect(() => { setTitleDraft(step.title || '') }, [step.title])

  const notesDirty = notes !== (step.notes || '')

  const saveTitle = async () => {
    const t = titleDraft.trim()
    setEditingTitle(false)
    if (t && t !== step.title) await onUpdate(step.id, { title: t })
    else setTitleDraft(step.title || '')
  }

  const startEditSub = (st) => { setEditingSub(st.id); setSubDraft(st.text || '') }
  const saveSub = async (st) => {
    const t = subDraft.trim()
    setEditingSub(null)
    if (t && t !== st.text) { await updateSubtask(st.id, { text: t }); await refresh() }
  }

  const cycleStatus = (e) => {
    e.stopPropagation()
    const idx = STATUS_CYCLE.indexOf(step.status || 'Not Started')
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onUpdate(step.id, { status: next })
  }

  const saveNotes = async () => {
    if (notes !== (step.notes || '')) await onUpdate(step.id, { notes })
  }

  const saveDeadline = async (val) => {
    setDeadline(val)
    await onUpdate(step.id, { deadline: val || null })
  }

  const addSub = async (e) => {
    e.preventDefault()
    if (!newSub.trim()) return
    await addSubtask(newSub.trim()); setNewSub('')
    await refresh()
  }

  const badge = deadlineBadge(step.deadline)

  return (
    <div ref={setNodeRef} style={{ ...S.wrap, ...dragStyle }}>
      <div style={S.header}>
        <span {...attributes} {...listeners} style={S.handle} title="Drag to reorder">⋮⋮</span>
        <button onClick={cycleStatus} title={STATUS_LABEL[step.status]}
          style={{ ...S.dot, background: STATUS_COLOR[step.status] || COLORS.muted }} />
        {editingTitle ? (
          <input autoFocus value={titleDraft} onClick={e => e.stopPropagation()}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); saveTitle() }
              if (e.key === 'Escape') { setTitleDraft(step.title || ''); setEditingTitle(false) }
            }}
            style={S.titleInput} />
        ) : (
          <span style={S.title} onClick={() => setExpanded(v => !v)}>{step.title}</span>
        )}
        {step.deadline && step.status !== 'Done' && (
          <span style={{ ...S.badge, background: badge.color, color: '#fff' }}>
            {badge.text}
          </span>
        )}
        <button onClick={e => { e.stopPropagation(); setEditingTitle(true) }}
          style={S.iconBtn} title="Rename step">✎</button>
        <button onClick={() => setExpanded(v => !v)} style={S.iconBtn} title={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '▾' : '▸'}
        </button>
      </div>

      {expanded && (
        <div style={S.body}>
          <div style={S.fieldRow}>
            <label style={S.fieldLabel}>Deadline</label>
            <DateInput value={deadline} onChange={saveDeadline} />
            {step.deadline && (
              <span style={S.dateYYMMDD}>{formatYYMMDD(step.deadline)}</span>
            )}
          </div>

          <div style={S.subhead}>Subtasks</div>
          {subtasks.map(st => (
            <div key={st.id} style={S.subRow}>
              <input type="checkbox" checked={!!st.done}
                onChange={async () => { await updateSubtask(st.id, { done: !st.done }); await refresh() }} />
              {editingSub === st.id ? (
                <input autoFocus value={subDraft}
                  onChange={e => setSubDraft(e.target.value)}
                  onBlur={() => saveSub(st)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); saveSub(st) }
                    if (e.key === 'Escape') setEditingSub(null)
                  }}
                  style={S.subEdit} />
              ) : (
                <span onClick={() => startEditSub(st)} title="Tap to rename"
                  style={{ ...S.subText, textDecoration: st.done ? 'line-through' : 'none',
                    color: st.done ? COLORS.muted : COLORS.text }}>{st.text}</span>
              )}
              <button onClick={async () => { await deleteSubtask(st.id); await refresh() }} style={S.subDel}>✕</button>
            </div>
          ))}
          <form onSubmit={addSub} style={S.subAdd}>
            <input style={S.subInput} value={newSub} onChange={e => setNewSub(e.target.value)}
              placeholder="New subtask" />
            <button type="submit" style={S.subAddBtn}>+ Add</button>
          </form>

          <div style={S.notesHead}>
            <span style={S.subhead}>Notes</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={saveNotes} disabled={!notesDirty}
              style={{ ...S.notesSave, opacity: notesDirty ? 1 : 0.4,
                cursor: notesDirty ? 'pointer' : 'default' }}>
              Save
            </button>
            <button type="button" onClick={() => setNotesOpen(v => !v)}
              style={S.iconBtn} title={notesOpen ? 'Collapse notes' : 'Expand notes'}>
              {notesOpen ? '▾' : '▸'}
            </button>
          </div>
          {notesOpen && (
            <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
              style={S.notes} rows={10} placeholder="Enter notes…" />
          )}

          <MoveToScheduleButton step={step} />

          <button onClick={() => onDelete(step.id)} style={S.delStep}>Delete step</button>
        </div>
      )}
    </div>
  )
}

const S = {
  wrap: { background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 10, padding: 12, flexWrap: 'wrap' },
  handle: { color: COLORS.muted, fontSize: 14, cursor: 'grab', userSelect: 'none',
    touchAction: 'none', padding: '0 2px' },
  dot: { width: 18, height: 18, borderRadius: 99, border: 0, cursor: 'pointer', flexShrink: 0 },
  title: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: 500, cursor: 'pointer',
    minWidth: 100 },
  titleInput: { flex: 1, minWidth: 100, background: COLORS.card, color: COLORS.text,
    border: `1px solid ${COLORS.primary}`, borderRadius: 8, padding: '6px 10px',
    fontSize: 14, fontWeight: 500, outline: 'none', fontFamily: 'inherit' },
  iconBtn: { background: 'transparent', color: COLORS.muted, border: 0, cursor: 'pointer',
    fontSize: 18, lineHeight: 1, padding: 6, minWidth: 36, minHeight: 36,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999 },
  body: { padding: 12, borderTop: `1px solid ${COLORS.border}`, display: 'flex',
    flexDirection: 'column', gap: 6 },
  fieldRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fieldLabel: { color: COLORS.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 0.5 },
  dateInput: { background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' },
  dateYYMMDD: { color: COLORS.muted, fontSize: 12 },
  subhead: { color: COLORS.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 0.5 },
  subRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' },
  subText: { flex: 1, fontSize: 13, cursor: 'pointer' },
  subEdit: { flex: 1, background: COLORS.card, color: COLORS.text,
    border: `1px solid ${COLORS.primary}`, borderRadius: 6, padding: '4px 8px',
    fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  subDel: { background: 'transparent', color: COLORS.muted, border: 0, cursor: 'pointer', fontSize: 12 },
  subAdd: { display: 'flex', gap: 6, marginTop: 4 },
  subInput: { flex: 1, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' },
  subAddBtn: { background: COLORS.border, color: COLORS.text, border: 0, borderRadius: 8,
    padding: '6px 10px', cursor: 'pointer', fontSize: 12 },
  notesHead: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 },
  notesSave: { background: COLORS.primary, color: '#fff', border: 0, borderRadius: 6,
    padding: '4px 12px', fontSize: 12, fontWeight: 600 },
  notes: { background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit' },
  delStep: { alignSelf: 'flex-start', marginTop: 8, background: COLORS.danger, color: '#fff',
    border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
}

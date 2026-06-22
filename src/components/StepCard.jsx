import { useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { COLORS, STATUS_CYCLE, STATUS_LABEL, STATUS_COLOR } from '../styles/theme'
import { useSubtasks } from '../hooks/useSubtasks'
import { deadlineBadge, formatYYMMDD } from '../lib/format'

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
  const [deadline, setDeadline] = useState(step.deadline || '')
  const [newSub, setNewSub] = useState('')
  const { subtasks, addSubtask, updateSubtask, deleteSubtask, refresh } = useSubtasks(expanded ? step.id : null)

  useEffect(() => { setNotes(step.notes || '') }, [step.notes])
  useEffect(() => { setDeadline(step.deadline || '') }, [step.deadline])

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
        <span style={S.title} onClick={() => setExpanded(v => !v)}>{step.title}</span>
        {step.deadline && (
          <span style={{ ...S.badge, color: badge.color, borderColor: `${badge.color}55` }}>
            {badge.text}
          </span>
        )}
        <span style={{ ...S.status, color: STATUS_COLOR[step.status] }}>{STATUS_LABEL[step.status]}</span>
        <button onClick={() => setExpanded(v => !v)} style={S.chev}>{expanded ? '▾' : '▸'}</button>
      </div>

      {expanded && (
        <div style={S.body}>
          <div style={S.fieldRow}>
            <label style={S.fieldLabel}>Deadline</label>
            <input type="date" value={deadline}
              onChange={e => setDeadline(e.target.value)}
              onBlur={e => saveDeadline(e.target.value)}
              style={S.dateInput} />
            {step.deadline && (
              <span style={S.dateYYMMDD}>{formatYYMMDD(step.deadline)}</span>
            )}
          </div>

          <div style={S.subhead}>Subtasks</div>
          {subtasks.map(st => (
            <div key={st.id} style={S.subRow}>
              <input type="checkbox" checked={!!st.done}
                onChange={async () => { await updateSubtask(st.id, { done: !st.done }); await refresh() }} />
              <span style={{ ...S.subText, textDecoration: st.done ? 'line-through' : 'none',
                color: st.done ? COLORS.muted : COLORS.text }}>{st.text}</span>
              <button onClick={async () => { await deleteSubtask(st.id); await refresh() }} style={S.subDel}>✕</button>
            </div>
          ))}
          <form onSubmit={addSub} style={S.subAdd}>
            <input style={S.subInput} value={newSub} onChange={e => setNewSub(e.target.value)}
              placeholder="New subtask" />
            <button type="submit" style={S.subAddBtn}>+ Add</button>
          </form>

          <div style={{ ...S.subhead, marginTop: 12 }}>Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
            style={S.notes} rows={3} placeholder="Enter notes…" />

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
  badge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: '1px solid' },
  status: { fontSize: 11, fontWeight: 600 },
  chev: { color: COLORS.muted, fontSize: 12, background: 'transparent', border: 0,
    cursor: 'pointer', padding: '0 4px' },
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
  subText: { flex: 1, fontSize: 13 },
  subDel: { background: 'transparent', color: COLORS.muted, border: 0, cursor: 'pointer', fontSize: 12 },
  subAdd: { display: 'flex', gap: 6, marginTop: 4 },
  subInput: { flex: 1, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 10px', fontSize: 13, outline: 'none' },
  subAddBtn: { background: COLORS.border, color: COLORS.text, border: 0, borderRadius: 8,
    padding: '6px 10px', cursor: 'pointer', fontSize: 12 },
  notes: { background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit' },
  delStep: { alignSelf: 'flex-start', marginTop: 4, background: 'transparent', color: COLORS.danger,
    border: 0, padding: '4px 0', cursor: 'pointer', fontSize: 12 },
}

import { useState, useEffect } from 'react'
import { COLORS, STATUS_CYCLE, STATUS_LABEL, STATUS_COLOR } from '../styles/theme'
import { useSubtasks } from '../hooks/useSubtasks'

export function StepCard({ step, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(step.notes || '')
  const [newSub, setNewSub] = useState('')
  const { subtasks, addSubtask, updateSubtask, deleteSubtask, refresh } = useSubtasks(expanded ? step.id : null)

  useEffect(() => { setNotes(step.notes || '') }, [step.notes])

  const cycleStatus = (e) => {
    e.stopPropagation()
    const idx = STATUS_CYCLE.indexOf(step.status || 'Not Started')
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onUpdate(step.id, { status: next })
  }

  const saveNotes = async () => {
    if (notes !== (step.notes || '')) await onUpdate(step.id, { notes })
  }

  const addSub = async (e) => {
    e.preventDefault()
    if (!newSub.trim()) return
    await addSubtask(newSub.trim()); setNewSub('')
    await refresh()
  }

  return (
    <div style={S.wrap}>
      <div style={S.header} onClick={() => setExpanded(v => !v)}>
        <button onClick={cycleStatus} title={STATUS_LABEL[step.status]}
          style={{ ...S.dot, background: STATUS_COLOR[step.status] || COLORS.muted }} />
        <span style={S.title}>{step.title}</span>
        <span style={{ ...S.status, color: STATUS_COLOR[step.status] }}>{STATUS_LABEL[step.status]}</span>
        <span style={S.chev}>{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div style={S.body}>
          <div style={S.subhead}>하위 작업 / Subtasks</div>
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
              placeholder="새 하위 작업 / New subtask" />
            <button type="submit" style={S.subAddBtn}>+ 추가</button>
          </form>

          <div style={{ ...S.subhead, marginTop: 12 }}>메모 / Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
            style={S.notes} rows={3} placeholder="메모를 입력하세요 / Enter notes…" />

          <button onClick={() => onDelete(step.id)} style={S.delStep}>단계 삭제 / Delete step</button>
        </div>
      )}
    </div>
  )
}

const S = {
  wrap: { background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 10, padding: 12, cursor: 'pointer' },
  dot: { width: 18, height: 18, borderRadius: 99, border: 0, cursor: 'pointer', flexShrink: 0 },
  title: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: 500 },
  status: { fontSize: 11, fontWeight: 600 },
  chev: { color: COLORS.muted, fontSize: 12, width: 14, textAlign: 'right' },
  body: { padding: 12, borderTop: `1px solid ${COLORS.border}`, display: 'flex', flexDirection: 'column', gap: 6 },
  subhead: { color: COLORS.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
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

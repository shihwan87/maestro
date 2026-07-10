import { useState, useMemo } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable'
import { COLORS } from '../styles/theme'
import { effectiveDeadline, deadlineBadge, formatYYMMDD } from '../lib/format'
import { useSteps } from '../hooks/useSteps'
import { StepCard } from './StepCard'

// Ordering: undone-with-deadline (soonest first) → undone-no-deadline
// (existing sort_order) → done (existing sort_order). Done steps are shown
// separately under a collapsed "Finished tasks" section.
function splitAndSort(steps) {
  const active = []
  const finished = []
  for (const s of steps) {
    if (s.status === 'Done') finished.push(s)
    else active.push(s)
  }
  active.sort((a, b) => {
    if (a.deadline && b.deadline) {
      if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    }
    if (a.deadline) return -1
    if (b.deadline) return 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })
  finished.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return { active, finished }
}

export function ProjectModal({ project, accent, onClose, onEdit, onDelete }) {
  const { steps, addStep, updateStep, deleteStep, reorderSteps, refresh } = useSteps(project?.id)
  const [newStep, setNewStep] = useState('')
  const [showFinished, setShowFinished] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  const { active: activeSteps, finished: finishedSteps } = useMemo(
    () => splitAndSort(steps), [steps],
  )

  if (!project) return null

  const eff = effectiveDeadline(project, steps)
  const badge = deadlineBadge(eff?.date)

  const submitStep = async (e) => {
    e.preventDefault()
    if (!newStep.trim()) return
    await addStep({ title: newStep.trim() })
    setNewStep(''); await refresh()
  }

  const onUpdateStep = async (id, patch) => { await updateStep(id, patch); await refresh() }
  const onDeleteStep = async (id) => { await deleteStep(id); await refresh() }

  // Drag reorder is a within-group tiebreaker: it only rearranges the
  // undated-active tail (deadlined steps auto-sort by date and would snap
  // back). We rewrite sort_order for the whole list based on the new order
  // of the target group, keeping deadlined + finished stable.
  const onDragEnd = async (e) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = activeSteps.findIndex(s => s.id === active.id)
    const newIdx = activeSteps.findIndex(s => s.id === over.id)
    if (oldIdx < 0 || newIdx < 0) return
    const reordered = arrayMove(activeSteps, oldIdx, newIdx)
    const nextOrder = [...reordered, ...finishedSteps].map(s => s.id)
    await reorderSteps(nextOrder)
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ ...S.modal, borderLeftColor: accent || COLORS.muted }}>
        <div style={S.head}>
          <div style={S.headLeft}>
            <div style={{ ...S.cat, color: accent || COLORS.muted }}>{project.category || 'Uncategorized'}</div>
            <div style={S.title}>{project.title}</div>
            <div style={S.metaRow}>
              <span style={{ ...S.badge, background: badge.color, color: '#fff' }}>
                {badge.text}
              </span>
              {project.deadline && (
                <span style={S.planned}>Planned due date: {formatYYMMDD(project.deadline)}</span>
              )}
            </div>
          </div>
          <div style={S.headBtns}>
            <button onClick={onEdit} style={S.editBtn}>Edit</button>
            {onDelete && !confirmDel && (
              <button onClick={() => setConfirmDel(true)} style={S.delBtn}>Delete</button>
            )}
            {onDelete && confirmDel && (
              <>
                <button onClick={async () => { await onDelete(project.id); setConfirmDel(false) }}
                  style={S.delConfirm}>Really delete?</button>
                <button onClick={() => setConfirmDel(false)} style={S.editBtn}>Cancel</button>
              </>
            )}
            <button onClick={onClose} style={S.closeBtn}>✕</button>
          </div>
        </div>

        <div style={S.body}>
          <div style={S.sectionHead}>Steps</div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={activeSteps.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div style={S.stepList}>
                {activeSteps.map(s => (
                  <StepCard key={s.id} step={s} onUpdate={onUpdateStep} onDelete={onDeleteStep} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {steps.length === 0 && <div style={S.empty}>No steps yet.</div>}

          {finishedSteps.length > 0 && (
            <div style={S.finishedBlock}>
              <button type="button" onClick={() => setShowFinished(v => !v)}
                style={S.finishedToggle}>
                {showFinished ? '▾' : '▸'} Finished tasks ({finishedSteps.length})
              </button>
              {showFinished && (
                <div style={{ ...S.stepList, marginTop: 8 }}>
                  {finishedSteps.map(s => (
                    <StepCard key={s.id} step={s} onUpdate={onUpdateStep} onDelete={onDeleteStep} />
                  ))}
                </div>
              )}
            </div>
          )}

          <form onSubmit={submitStep} style={S.addRow}>
            <input style={S.addInput} value={newStep} onChange={e => setNewStep(e.target.value)}
              placeholder="New step title" />
            <button type="submit" style={{ ...S.addBtn, background: accent || COLORS.primary }}>+ Add step</button>
          </form>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'grid', placeItems: 'center', padding: 16, zIndex: 100, overflowY: 'auto' },
  modal: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderLeft: '14px solid',
    borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex',
    flexDirection: 'column', overflow: 'hidden' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
    padding: 20, borderBottom: `1px solid ${COLORS.border}` },
  headLeft: { flex: 1, minWidth: 0 },
  cat: { fontSize: 12, fontWeight: 600 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: 600, margin: '4px 0 8px' },
  metaRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  badge: { display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '2px 10px',
    borderRadius: 999 },
  planned: { color: COLORS.muted, fontSize: 12 },
  headBtns: { display: 'flex', gap: 6, flexShrink: 0 },
  editBtn: { background: 'transparent', color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 },
  delBtn: { background: 'transparent', color: COLORS.danger, border: `1px solid ${COLORS.danger}`,
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 },
  delConfirm: { background: COLORS.danger, color: '#fff', border: 0,
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  closeBtn: { background: 'transparent', color: COLORS.muted, border: 0, fontSize: 18,
    cursor: 'pointer', padding: '0 6px' },
  body: { padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  sectionHead: { color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 4 },
  stepList: { display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { color: COLORS.muted, fontSize: 13, padding: '12px 0' },
  addRow: { display: 'flex', gap: 6, marginTop: 8 },
  addInput: { flex: 1, background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none' },
  addBtn: { color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontSize: 13, fontWeight: 600 },
  finishedBlock: { marginTop: 12, borderTop: `1px dashed ${COLORS.border}`, paddingTop: 12 },
  finishedToggle: { background: 'transparent', color: COLORS.muted, border: 0, cursor: 'pointer',
    fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, padding: 0 },
}

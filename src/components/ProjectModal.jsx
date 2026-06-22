import { useState } from 'react'
import { COLORS, CATEGORY_LABEL } from '../styles/theme'
import { deadlineBadge } from '../lib/format'
import { useSteps } from '../hooks/useSteps'
import { StepCard } from './StepCard'

export function ProjectModal({ project, onClose, onEdit }) {
  const { steps, addStep, updateStep, deleteStep, refresh } = useSteps(project?.id)
  const [newStep, setNewStep] = useState('')

  if (!project) return null
  const accent = COLORS[project.category] || COLORS.muted
  const badge = deadlineBadge(project.deadline)

  const submitStep = async (e) => {
    e.preventDefault()
    if (!newStep.trim()) return
    await addStep({ title: newStep.trim() })
    setNewStep(''); await refresh()
  }

  const onUpdateStep = async (id, patch) => { await updateStep(id, patch); await refresh() }
  const onDeleteStep = async (id) => { await deleteStep(id); await refresh() }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ ...S.modal, borderLeftColor: accent }}>
        <div style={S.head}>
          <div>
            <div style={{ ...S.cat, color: accent }}>{CATEGORY_LABEL[project.category] || project.category}</div>
            <div style={S.title}>{project.title}</div>
            <div style={{ ...S.badge, color: badge.color, borderColor: `${badge.color}55` }}>{badge.text}</div>
          </div>
          <div style={S.headBtns}>
            <button onClick={onEdit} style={S.editBtn}>수정 / Edit</button>
            <button onClick={onClose} style={S.closeBtn}>✕</button>
          </div>
        </div>

        <div style={S.body}>
          <div style={S.sectionHead}>단계 / Steps</div>
          {steps.map(s => (
            <StepCard key={s.id} step={s} onUpdate={onUpdateStep} onDelete={onDeleteStep} />
          ))}
          {steps.length === 0 && <div style={S.empty}>아직 단계가 없습니다. / No steps yet.</div>}

          <form onSubmit={submitStep} style={S.addRow}>
            <input style={S.addInput} value={newStep} onChange={e => setNewStep(e.target.value)}
              placeholder="새 단계 제목 / New step title" />
            <button type="submit" style={{ ...S.addBtn, background: accent }}>+ 단계 추가</button>
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
  cat: { fontSize: 12, fontWeight: 600 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: 600, margin: '4px 0 8px' },
  badge: { display: 'inline-block', fontSize: 12, fontWeight: 600, padding: '2px 10px',
    borderRadius: 999, border: '1px solid' },
  headBtns: { display: 'flex', gap: 6 },
  editBtn: { background: 'transparent', color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 },
  closeBtn: { background: 'transparent', color: COLORS.muted, border: 0, fontSize: 18,
    cursor: 'pointer', padding: '0 6px' },
  body: { padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 },
  sectionHead: { color: COLORS.muted, fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 4 },
  empty: { color: COLORS.muted, fontSize: 13, padding: '12px 0' },
  addRow: { display: 'flex', gap: 6, marginTop: 8 },
  addInput: { flex: 1, background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none' },
  addBtn: { color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontSize: 13, fontWeight: 600 },
}

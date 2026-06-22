import { useEffect, useState } from 'react'
import { COLORS, CATEGORY_LABEL } from '../styles/theme'
import { deadlineBadge, progress } from '../lib/format'
import { supabase } from '../lib/supabase'

export function ProjectCard({ project, onOpen }) {
  const [steps, setSteps] = useState([])
  const accent = COLORS[project.category] || COLORS.muted

  useEffect(() => {
    let mounted = true
    supabase.from('steps').select('id,status').eq('project_id', project.id).then(({ data }) => {
      if (mounted && data) setSteps(data)
    })
    const ch = supabase.channel(`pc-${project.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'steps', filter: `project_id=eq.${project.id}` },
        () => {
          supabase.from('steps').select('id,status').eq('project_id', project.id).then(({ data }) => {
            if (mounted && data) setSteps(data)
          })
        })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(ch) }
  }, [project.id])

  const badge = deadlineBadge(project.deadline)
  const prog = progress(steps)

  return (
    <button onClick={() => onOpen(project)} style={{ ...S.card, borderLeftColor: accent }}>
      <div style={S.row}>
        <span style={{ ...S.cat, color: accent }}>{CATEGORY_LABEL[project.category] || project.category}</span>
        <span style={{ ...S.badge, color: badge.color, borderColor: `${badge.color}55` }}>{badge.text}</span>
      </div>
      <div style={S.title}>{project.title}</div>
      <div style={S.progressWrap}>
        <div style={{ ...S.progressBar, width: `${prog.pct}%`, background: accent }} />
      </div>
      <div style={S.progressText}>
        {prog.done}/{prog.total} 단계 완료 / steps done
      </div>
    </button>
  )
}

const S = {
  card: { textAlign: 'left', background: COLORS.card, border: `1px solid ${COLORS.border}`,
    borderLeft: '14px solid', borderRadius: 14, padding: 16, cursor: 'pointer',
    color: COLORS.text, transition: 'transform .08s, background .1s',
    display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cat: { fontSize: 12, fontWeight: 600, letterSpacing: 0.3 },
  badge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: '1px solid' },
  title: { fontSize: 16, fontWeight: 600, lineHeight: 1.3 },
  progressWrap: { height: 6, background: COLORS.bg, borderRadius: 99, overflow: 'hidden' },
  progressBar: { height: '100%', transition: 'width .2s' },
  progressText: { fontSize: 12, color: COLORS.muted },
}

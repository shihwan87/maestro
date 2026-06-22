import { COLORS } from '../styles/theme'
import { effectiveDeadline, deadlineBadge, progress } from '../lib/format'

export function ProjectCard({ project, steps, accent, onOpen }) {
  const eff = effectiveDeadline(project, steps)
  const badge = deadlineBadge(eff?.date)
  const prog = progress(steps)
  const stroke = accent || COLORS.muted

  return (
    <button onClick={() => onOpen(project)} style={{ ...S.card, borderLeftColor: stroke }}>
      <div style={S.row}>
        <span style={{ ...S.cat, color: stroke }}>{project.category || 'Uncategorized'}</span>
        <span style={{ ...S.badge, color: badge.color, borderColor: `${badge.color}55` }}>{badge.text}</span>
      </div>
      <div style={S.title}>{project.title}</div>
      <div style={S.progressWrap}>
        <div style={{ ...S.progressBar, width: `${prog.pct}%`, background: stroke }} />
      </div>
      <div style={S.progressText}>{prog.done}/{prog.total} steps done</div>
    </button>
  )
}

const S = {
  card: { textAlign: 'left', background: COLORS.card, border: `1px solid ${COLORS.border}`,
    borderLeft: '14px solid', borderRadius: 14, padding: 16, cursor: 'pointer',
    color: COLORS.text, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cat: { fontSize: 12, fontWeight: 600, letterSpacing: 0.3 },
  badge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: '1px solid' },
  title: { fontSize: 16, fontWeight: 600, lineHeight: 1.3 },
  progressWrap: { height: 6, background: COLORS.bg, borderRadius: 99, overflow: 'hidden' },
  progressBar: { height: '100%', transition: 'width .2s' },
  progressText: { fontSize: 12, color: COLORS.muted },
}

import { useMemo, useState } from 'react'
import { COLORS } from '../styles/theme'
import { deadlineBadge } from '../lib/format'
import { BUCKETS, groupIntoBuckets, scopeTag } from '../lib/overview'
import { useAllPending } from '../hooks/useAllPending'
import { useCategories } from '../hooks/useCategories'
import { ProjectModal } from './ProjectModal'

// OVERVIEW — the one place WORK and PERSONAL are shown together, ordered by
// time rather than by scope. Rows are pending steps (see useAllPending);
// tapping one opens the owning project in the same ProjectModal the WORK and
// PERSONAL tabs use, so there is exactly one editing surface in the app.
export function OverviewTab() {
  const { rows, loading } = useAllPending()
  const workCats = useCategories('work')
  const personalCats = useCategories('personal')
  const [opened, setOpened] = useState(null)
  // Long term starts collapsed; the others start open. Kept as an override map
  // so a user toggle survives re-renders driven by realtime updates.
  const [openState, setOpenState] = useState(
    () => Object.fromEntries(BUCKETS.map(b => [b.id, !b.collapsed])),
  )

  const buckets = useMemo(() => groupIntoBuckets(rows), [rows])

  const colorForRow = (row) => {
    const pack = row.project.scope === 'personal' ? personalCats : workCats
    return pack.colorFor(row.project.category)
  }

  const pendingCount = rows.length

  return (
    <div style={S.page} className="safe-top safe-bottom">
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>Overview</h1>
          <p style={S.sub}>{pendingCount} pending task{pendingCount === 1 ? '' : 's'} across Work and Personal</p>
        </div>
      </header>

      {loading && <p style={S.muted}>Loading…</p>}

      {!loading && pendingCount === 0 && <p style={S.muted}>Nothing pending. </p>}

      {BUCKETS.map(b => {
        const list = buckets[b.id]
        if (!list.length) return null
        const open = openState[b.id]
        return (
          <section key={b.id} style={S.section}>
            <button type="button" style={S.sectionHead}
              onClick={() => setOpenState(s => ({ ...s, [b.id]: !s[b.id] }))}>
              <span style={{ color: b.id === 'overdue' ? COLORS.danger : COLORS.muted }}>
                {open ? '▾' : '▸'} {b.label}
              </span>
              <span style={S.count}>{list.length}</span>
            </button>
            {open && (
              <div style={S.list} className="ov-list">
                {list.map(row => (
                  <OverviewRow key={row.id} row={row} accent={colorForRow(row)}
                    onOpen={() => setOpened(row.project)} />
                ))}
              </div>
            )}
          </section>
        )
      })}

      <ProjectModal project={opened}
        accent={opened
          ? (opened.scope === 'personal' ? personalCats : workCats).colorFor(opened.category)
          : null}
        onClose={() => setOpened(null)} />
    </div>
  )
}

// One line per row: [W/P] step · project · D-day · category. The exact date is
// deliberately absent — the D-day badge carries the urgency, and tapping the
// row opens the project where the real date lives. Which parts survive a
// narrow screen is decided by the .ov-* container queries in index.css, not
// here.
function OverviewRow({ row, accent, onOpen }) {
  const badge = deadlineBadge(row.date)
  const tag = scopeTag(row.project.scope)
  return (
    <button onClick={onOpen}
      className="ov-row"
      style={{ ...S.row, borderLeftColor: accent || COLORS.muted }}>
      <span className="ov-tag"
        style={{ ...S.tag, borderColor: accent || COLORS.muted, color: accent || COLORS.muted }}>
        {tag}
      </span>
      <span className="ov-step" style={S.taskTitle}>
        {row.kind === 'project' ? `${row.title} (no steps yet)` : row.title}
      </span>
      <span className="ov-project" style={S.projectTitle}>{row.project.title}</span>
      <span className="ov-badge" style={{ ...S.badge, background: badge.color, color: '#fff' }}>
        {badge.text}
      </span>
      <span className="ov-cat" style={{ ...S.cat, color: accent || COLORS.muted }}>
        {row.project.category || 'Uncategorized'}
      </span>
    </button>
  )
}

const S = {
  page: { minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
    paddingLeft: 12, paddingRight: 12, maxWidth: 1200, margin: '0 auto' },
  header: { marginBottom: 20 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: COLORS.muted, fontSize: 13, margin: '4px 0 0' },
  section: { marginBottom: 14 },
  sectionHead: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'transparent', border: 0, borderBottom: `1px solid ${COLORS.border}`,
    padding: '8px 2px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.6 },
  count: { color: COLORS.muted, fontSize: 12, fontWeight: 600 },
  list: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 },
  row: { textAlign: 'left', background: COLORS.card, border: `1px solid ${COLORS.border}`,
    borderLeft: '6px solid', borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
    color: COLORS.text },
  tag: { fontSize: 10, fontWeight: 700, border: '1px solid', borderRadius: 4,
    padding: '0 4px' },
  projectTitle: { fontSize: 11, fontWeight: 600, color: COLORS.muted },
  cat: { fontSize: 11, fontWeight: 600 },
  taskTitle: { fontSize: 14, fontWeight: 600 },
  badge: { fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999 },
  muted: { color: COLORS.muted, fontSize: 13 },
}

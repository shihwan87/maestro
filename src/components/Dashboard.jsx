import { useState, useMemo } from 'react'
import { COLORS, CATEGORIES, CATEGORY_LABEL } from '../styles/theme'
import { useProjects } from '../hooks/useProjects'
import { ProjectCard } from './ProjectCard'
import { UrgentBanner } from './UrgentBanner'
import { AddProjectModal } from './AddProjectModal'
import { ProjectModal } from './ProjectModal'

export function Dashboard() {
  const { projects, loading, error, addProject, updateProject, deleteProject, refresh } = useProjects()
  const [filter, setFilter] = useState('All')
  const [opened, setOpened] = useState(null)         // project being viewed
  const [editing, setEditing] = useState(null)       // project being edited (or 'new')
  const [addOpen, setAddOpen] = useState(false)

  const visible = useMemo(
    () => filter === 'All' ? projects : projects.filter(p => p.category === filter),
    [projects, filter]
  )

  const saveProject = async (payload) => {
    if (editing && editing !== 'new') {
      await updateProject(editing.id, payload)
      if (opened && opened.id === editing.id) setOpened({ ...opened, ...payload })
    } else {
      await addProject(payload)
    }
    await refresh()
  }

  const doDelete = async (id) => {
    await deleteProject(id); await refresh()
    if (opened?.id === id) setOpened(null)
  }

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>프로젝트 / Projects</h1>
          <p style={S.sub}>{projects.length}개 / {projects.length} total</p>
        </div>
        <button style={S.addBtn} onClick={() => { setEditing('new'); setAddOpen(true) }}>
          + 새 프로젝트 / New
        </button>
      </header>

      <UrgentBanner projects={projects} onClick={(p) => setOpened(p)} />

      <div style={S.filters}>
        {['All', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setFilter(c)}
            style={{
              ...S.filter,
              background: filter === c ? (COLORS[c] || COLORS.border) + '22' : 'transparent',
              borderColor: filter === c ? (COLORS[c] || COLORS.text) : COLORS.border,
              color: filter === c ? (COLORS[c] || COLORS.text) : COLORS.muted,
            }}>
            {c === 'All' ? '전체 / All' : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {loading && <p style={S.muted}>불러오는 중… / Loading…</p>}
      {error && <p style={S.err}>{error.message}</p>}

      <div style={S.grid}>
        {visible.map(p => (
          <ProjectCard key={p.id} project={p} onOpen={setOpened} />
        ))}
      </div>

      {!loading && visible.length === 0 && (
        <p style={S.muted}>프로젝트가 없습니다. / No projects.</p>
      )}

      <ProjectModal project={opened} onClose={() => setOpened(null)}
        onEdit={() => { setEditing(opened); setAddOpen(true) }} />

      <AddProjectModal
        open={addOpen}
        initial={editing === 'new' ? null : editing}
        onClose={() => { setAddOpen(false); setEditing(null) }}
        onSave={saveProject}
        onDelete={doDelete}
      />
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
    padding: '24px 20px 60px', maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: COLORS.muted, fontSize: 13, margin: '4px 0 0' },
  addBtn: { background: COLORS['ICU/Clinical'], color: '#fff', border: 0, borderRadius: 10,
    padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 },
  filter: { padding: '6px 12px', borderRadius: 999, border: '1px solid',
    cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 },
  muted: { color: COLORS.muted, fontSize: 13 },
  err: { color: COLORS.danger, fontSize: 13 },
}

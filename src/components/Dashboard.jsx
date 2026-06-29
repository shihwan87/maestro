import { useState, useMemo } from 'react'
import { COLORS } from '../styles/theme'
import { effectiveDeadline } from '../lib/format'
import { useProjects } from '../hooks/useProjects'
import { useCategories } from '../hooks/useCategories'
import { useStepsByProject } from '../hooks/useStepsByProject'
import { ProjectCard } from './ProjectCard'
import { UrgentBanner } from './UrgentBanner'
import { AddProjectModal } from './AddProjectModal'
import { ProjectModal } from './ProjectModal'
import { CategoryManager } from './CategoryManager'

export function Dashboard({ scope = 'work', title = 'Projects', itemNoun = 'Project' }) {
  const { projects, loading, error, addProject, updateProject, deleteProject, refresh } = useProjects(scope)
  const { categories, addCategory, updateCategory, deleteCategory, reorderCategories, colorFor } = useCategories(scope)
  const { stepsByProject } = useStepsByProject()

  const [filter, setFilter] = useState('All')
  const [opened, setOpened] = useState(null)
  const [editing, setEditing] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [catMgrOpen, setCatMgrOpen] = useState(false)

  // Filter by category, then sort by soonest effective deadline (urgent first).
  // Projects with no deadline sink to the bottom.
  const visible = useMemo(() => {
    const list = filter === 'All' ? projects : projects.filter(p => p.category === filter)
    return [...list].sort((a, b) => {
      const da = effectiveDeadline(a, stepsByProject.get(a.id) || [])?.date || null
      const db = effectiveDeadline(b, stepsByProject.get(b.id) || [])?.date || null
      if (da && db) return da < db ? -1 : da > db ? 1 : 0
      if (da) return -1
      if (db) return 1
      return 0
    })
  }, [projects, filter, stepsByProject])

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
    <div style={S.page} className="safe-top safe-bottom">
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>{title}</h1>
          <p style={S.sub}>{projects.length} total</p>
        </div>
        <div style={S.headBtns}>
          <button style={S.catBtn} onClick={() => setCatMgrOpen(true)}>Categories</button>
          <button style={S.addBtn} onClick={() => { setEditing('new'); setAddOpen(true) }}>
            + New {itemNoun}
          </button>
        </div>
      </header>

      <UrgentBanner projects={projects} stepsByProject={stepsByProject}
        onClick={(p) => setOpened(p)} />

      <div style={S.filters}>
        <FilterChip label="All" active={filter === 'All'} color={COLORS.text}
          onClick={() => setFilter('All')} />
        {categories.map(c => (
          <FilterChip key={c.id} label={c.name} active={filter === c.name} color={c.color}
            onClick={() => setFilter(c.name)} />
        ))}
      </div>

      {loading && <p style={S.muted}>Loading…</p>}
      {error && <p style={S.err}>{error.message}</p>}

      <div style={S.grid}>
        {visible.map(p => (
          <ProjectCard key={p.id} project={p}
            steps={stepsByProject.get(p.id) || []}
            accent={colorFor(p.category)}
            onOpen={setOpened} />
        ))}
      </div>

      {!loading && visible.length === 0 && (
        <p style={S.muted}>No projects.</p>
      )}

      <ProjectModal project={opened}
        accent={opened ? colorFor(opened.category) : null}
        onClose={() => setOpened(null)}
        onEdit={() => { setEditing(opened); setAddOpen(true) }} />

      <AddProjectModal
        open={addOpen}
        initial={editing === 'new' ? null : editing}
        categories={categories}
        itemNoun={itemNoun}
        onClose={() => { setAddOpen(false); setEditing(null) }}
        onSave={saveProject}
        onDelete={doDelete}
      />

      <CategoryManager open={catMgrOpen} onClose={() => setCatMgrOpen(false)}
        categories={categories}
        onAdd={addCategory} onUpdate={updateCategory} onDelete={deleteCategory}
        onReorder={reorderCategories} />
    </div>
  )
}

function FilterChip({ label, active, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        ...FS.chip,
        background: active ? `${color}22` : 'transparent',
        borderColor: active ? color : COLORS.border,
        color: active ? color : COLORS.muted,
      }}>{label}</button>
  )
}

const FS = {
  chip: { padding: '6px 12px', borderRadius: 999, border: '1px solid',
    cursor: 'pointer', fontSize: 12, fontWeight: 600 },
}

const S = {
  page: { minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
    paddingLeft: 20, paddingRight: 20, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: COLORS.muted, fontSize: 13, margin: '4px 0 0' },
  headBtns: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  catBtn: { background: 'transparent', color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontSize: 13 },
  addBtn: { background: COLORS.primary, color: '#fff', border: 0, borderRadius: 10,
    padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 },
  muted: { color: COLORS.muted, fontSize: 13 },
  err: { color: COLORS.danger, fontSize: 13 },
}

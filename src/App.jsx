import { useState } from 'react'
import { useProjects } from './hooks/useProjects'

export default function App() {
  const { projects, loading, error, addProject, deleteProject } = useProjects()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('ICU/Clinical')
  const [deadline, setDeadline] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!title) return
    await addProject({ title, category, deadline: deadline || null })
    setTitle(''); setDeadline('')
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Schemanager — debug / 디버그</h1>

      <form onSubmit={submit} style={S.form}>
        <input style={S.input} placeholder="title / 제목" value={title} onChange={e => setTitle(e.target.value)} />
        <select style={S.input} value={category} onChange={e => setCategory(e.target.value)}>
          <option>ICU/Clinical</option>
          <option>Research</option>
          <option>Education</option>
        </select>
        <input style={S.input} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        <button style={S.btn} type="submit">Add / 추가</button>
      </form>

      {loading && <p style={S.muted}>Loading… / 불러오는 중…</p>}
      {error && <p style={S.err}>Error: {error.message}</p>}

      <ul style={S.list}>
        {projects.map(p => (
          <li key={p.id} style={S.row}>
            <span style={S.cat[p.category] || S.cat.default}>{p.category || '—'}</span>
            <span style={S.title}>{p.title}</span>
            <span style={S.muted}>{p.deadline || 'no deadline / 마감 없음'}</span>
            <button style={S.btnSmall} onClick={() => deleteProject(p.id)}>Delete / 삭제</button>
          </li>
        ))}
      </ul>
      {!loading && projects.length === 0 && (
        <p style={S.muted}>No projects yet. / 프로젝트가 없습니다.</p>
      )}
    </div>
  )
}

const COLORS = { 'ICU/Clinical': '#4a9eff', Research: '#4ecf7a', Education: '#c47aff' }
const S = {
  page: { background: '#0a0a14', color: '#e6e7ee', minHeight: '100vh', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' },
  h1: { fontSize: 20, marginBottom: 16, fontWeight: 600 },
  form: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  input: { background: '#141823', color: '#e6e7ee', border: '1px solid #2a3040', borderRadius: 8, padding: '8px 10px', fontSize: 14 },
  btn: { background: '#4a9eff', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 },
  btnSmall: { background: '#2a3040', color: '#e6e7ee', border: 0, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#141823', borderRadius: 10 },
  title: { flex: 1, fontWeight: 500 },
  muted: { color: '#8a8fa3', fontSize: 13 },
  err: { color: '#ff6b6b' },
  cat: {
    'ICU/Clinical': { color: COLORS['ICU/Clinical'], fontSize: 12, fontWeight: 600, minWidth: 110 },
    Research: { color: COLORS.Research, fontSize: 12, fontWeight: 600, minWidth: 110 },
    Education: { color: COLORS.Education, fontSize: 12, fontWeight: 600, minWidth: 110 },
    default: { color: '#8a8fa3', fontSize: 12, minWidth: 110 },
  },
}

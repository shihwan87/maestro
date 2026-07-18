import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '../styles/theme'
import { supabase } from '../lib/supabase'

const STATUS_COLOR = {
  open:      '#f7b955',
  done:      '#3ddc97',
  dismissed: '#6b7280',
}

export function ConfigTab() {
  const [text, setText] = useState('')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('claude_requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setErr(error.message)
    else setRequests(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('claude-requests-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claude_requests' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  const submit = async (e) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    setSending(true); setErr(null)
    try {
      const { error } = await supabase.from('claude_requests').insert({ text: t })
      if (error) throw error
      setText('')
    } catch (e) { setErr(e.message || String(e)) }
    finally { setSending(false) }
  }

  const setStatus = async (id, status) => {
    const { error } = await supabase.from('claude_requests').update({ status }).eq('id', id)
    if (error) setErr(error.message)
  }

  const commit = import.meta.env.VITE_COMMIT_SHA || 'dev'
  const repoUrl = 'https://github.com/shihwan87/maestro/blob/main/full_dev_plan.md'

  return (
    <div style={S.page} className="safe-top">
      <header style={S.header}>
        <h1 style={S.h1}>Config</h1>
        <p style={S.sub}>Send a request to Claude. He reads them next time he opens this repo.</p>
      </header>

      <form onSubmit={submit} style={S.form}>
        <textarea value={text} onChange={e => setText(e.target.value)}
          placeholder="e.g. add weekly review reminder; tweak priority colors; explain step deadlines..."
          style={S.textarea} rows={5} />
        {err && <p style={S.err}>{err}</p>}
        <div style={S.formRow}>
          <span style={S.muted}>{text.length} chars</span>
          <button type="submit" disabled={sending || !text.trim()} style={S.send}>
            {sending ? 'Sending…' : 'Send to Claude'}
          </button>
        </div>
      </form>

      <h2 style={S.h2}>Past requests</h2>
      {loading && <p style={S.muted}>Loading…</p>}
      {!loading && requests.length === 0 && <p style={S.muted}>No requests yet.</p>}
      <ul style={S.list}>
        {requests.map(r => (
          <li key={r.id} style={S.item}>
            <div style={S.itemHead}>
              <span style={{ ...S.statusPill, background: STATUS_COLOR[r.status] || COLORS.muted }}>
                {r.status}
              </span>
              <span style={S.muted}>{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <div style={S.itemText}>{r.text}</div>
            {r.response && <div style={S.response}><strong>Reply:</strong> {r.response}</div>}
            {r.status === 'open' && (
              <div style={S.itemActions}>
                <button style={S.smallBtn} onClick={() => setStatus(r.id, 'done')}>Mark done</button>
                <button style={S.smallBtn} onClick={() => setStatus(r.id, 'dismissed')}>Dismiss</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <footer style={S.footer}>
        <div>build: {commit}</div>
        <a style={S.link} href={repoUrl} target="_blank" rel="noreferrer">full_dev_plan.md</a>
      </footer>
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
    paddingLeft: 20, paddingRight: 20, maxWidth: 800, margin: '0 auto' },
  header: { marginBottom: 16 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: COLORS.muted, fontSize: 13, margin: '4px 0 0' },
  h2: { fontSize: 14, fontWeight: 600, color: COLORS.muted, margin: '24px 0 8px' },
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  textarea: { background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 12, padding: 12, fontSize: 14, outline: 'none', resize: 'vertical',
    fontFamily: 'inherit' },
  formRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  send: { background: COLORS.primary, color: '#fff', border: 0, borderRadius: 10,
    padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  item: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 12 },
  itemHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemText: { fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  response: { marginTop: 8, padding: 8, background: COLORS.bg, borderRadius: 8, fontSize: 13 },
  itemActions: { display: 'flex', gap: 6, marginTop: 8 },
  smallBtn: { background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  statusPill: { color: '#0a0a14', fontSize: 10, fontWeight: 700, padding: '2px 8px',
    borderRadius: 999, letterSpacing: 0.5, textTransform: 'uppercase' },
  muted: { color: COLORS.muted, fontSize: 12 },
  err: { color: COLORS.danger, fontSize: 13 },
  footer: { marginTop: 32, padding: '16px 0', borderTop: `1px solid ${COLORS.border}`,
    display: 'flex', justifyContent: 'space-between', color: COLORS.muted, fontSize: 12 },
  link: { color: COLORS.primary, textDecoration: 'none' },
}

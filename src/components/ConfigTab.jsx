import { useEffect, useState, useCallback } from 'react'
import { COLORS } from '../styles/theme'
import { supabase } from '../lib/supabase'

const STATUS_COLOR = {
  open:      '#f7b955',
  proposed:  '#5b9dff',
  executing: '#9b7bff',
  done:      '#3ddc97',
  dismissed: '#6b7280',
  failed:    '#ff5b6e',
}

const TIER_COLOR = {
  trivial:     '#3ddc97',
  ambiguous:   '#f7b955',
  non_trivial: '#ff5b6e',
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

  const setStatus = async (id, status, extra = {}) => {
    const patch = { status, ...extra }
    if (status === 'executing') patch.approved_at = new Date().toISOString()
    const { error } = await supabase.from('claude_requests').update(patch).eq('id', id)
    if (error) setErr(error.message)
  }

  const approve = (r) => setStatus(r.id, 'executing')
  const reject  = (r) => setStatus(r.id, 'dismissed')
  const commit  = import.meta.env.VITE_COMMIT_SHA || 'dev'
  const repoUrl = 'https://github.com/shihwan87/maestro/blob/main/full_dev_plan.md'

  // Hard refresh: unregister service workers and clear caches so the next
  // load pulls the freshest deployed bundle instead of a stale PWA copy.
  const hardRefresh = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } finally {
      window.location.reload()
    }
  }

  return (
    <div style={S.page} className="safe-top">
      <header style={S.header}>
        <div style={S.headerRow}>
          <h1 style={S.h1}>Requests to Claude</h1>
          <button type="button" onClick={hardRefresh} style={S.refresh} title="Clear PWA cache and reload">
            ↻ Hard refresh
          </button>
        </div>
        <p style={S.sub}>Send a request to Claude. The agent proposes a plan; you approve here.</p>
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

      <h2 style={S.h2}>Requests</h2>
      {loading && <p style={S.muted}>Loading…</p>}
      {!loading && requests.length === 0 && <p style={S.muted}>No requests yet.</p>}
      <ul style={S.list}>
        {requests.map(r => {
          const commitHref = r.commit_sha
            ? `https://github.com/shihwan87/maestro/commit/${r.commit_sha}`
            : null
          return (
            <li key={r.id} style={S.item}>
              <div style={S.itemHead}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ ...S.statusPill, background: STATUS_COLOR[r.status] || COLORS.muted }}>
                    {r.status}
                  </span>
                  {r.tier && (
                    <span style={{ ...S.tierPill, color: TIER_COLOR[r.tier] || COLORS.muted,
                      borderColor: TIER_COLOR[r.tier] || COLORS.border }}>
                      {r.tier.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <span style={S.muted}>{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <div style={S.itemText}>{r.text}</div>

              {r.proposal && (
                <div style={S.proposal}>
                  <strong style={{ fontSize: 12, color: COLORS.muted }}>PROPOSAL</strong>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{r.proposal}</div>
                </div>
              )}

              {r.response && (
                <div style={S.response}><strong>Reply:</strong> {r.response}</div>
              )}
              {r.error && (
                <div style={S.errBox}><strong>Error:</strong> {r.error}</div>
              )}
              {commitHref && (
                <div style={S.commitRow}>
                  <a style={S.link} href={commitHref} target="_blank" rel="noreferrer">
                    {r.commit_sha.slice(0, 7)}
                  </a>
                </div>
              )}

              {r.status === 'proposed' && (
                <div style={S.itemActions}>
                  <button style={{ ...S.smallBtn, borderColor: TIER_COLOR.trivial, color: TIER_COLOR.trivial }}
                    onClick={() => approve(r)}>Approve & run</button>
                  <button style={S.smallBtn} onClick={() => reject(r)}>Reject</button>
                </div>
              )}
              {r.status === 'open' && (
                <div style={S.itemActions}>
                  <button style={S.smallBtn} onClick={() => setStatus(r.id, 'done')}>Mark done</button>
                  <button style={S.smallBtn} onClick={() => setStatus(r.id, 'dismissed')}>Dismiss</button>
                </div>
              )}
              {r.status === 'failed' && (
                <div style={S.itemActions}>
                  <button style={S.smallBtn} onClick={() => setStatus(r.id, 'open', { error: null })}>Retry</button>
                  <button style={S.smallBtn} onClick={() => setStatus(r.id, 'dismissed')}>Dismiss</button>
                </div>
              )}
            </li>
          )
        })}
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
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  refresh: { background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    whiteSpace: 'nowrap' },
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
  itemHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
  itemText: { fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  proposal: { marginTop: 10, padding: 10, background: COLORS.bg,
    border: `1px dashed ${COLORS.border}`, borderRadius: 8, fontSize: 13 },
  response: { marginTop: 8, padding: 8, background: COLORS.bg, borderRadius: 8, fontSize: 13 },
  errBox: { marginTop: 8, padding: 8, background: '#3a1e1e', borderRadius: 8, fontSize: 13, color: COLORS.danger },
  commitRow: { marginTop: 6, fontSize: 12, fontFamily: 'monospace' },
  itemActions: { display: 'flex', gap: 6, marginTop: 8 },
  smallBtn: { background: 'transparent', color: COLORS.muted, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  statusPill: { color: '#0a0a14', fontSize: 10, fontWeight: 700, padding: '2px 8px',
    borderRadius: 999, letterSpacing: 0.5, textTransform: 'uppercase' },
  tierPill: { background: 'transparent', border: '1px solid', fontSize: 10, fontWeight: 600,
    padding: '2px 8px', borderRadius: 999, letterSpacing: 0.5, textTransform: 'uppercase' },
  muted: { color: COLORS.muted, fontSize: 12 },
  err: { color: COLORS.danger, fontSize: 13 },
  footer: { marginTop: 32, padding: '16px 0', borderTop: `1px solid ${COLORS.border}`,
    display: 'flex', justifyContent: 'space-between', color: COLORS.muted, fontSize: 12 },
  link: { color: COLORS.primary, textDecoration: 'none' },
}

import { useEffect, useState } from 'react'
import { COLORS } from '../styles/theme'
import { getScheduleStatus, setScheduleMigration } from '../lib/scheduleExport'

// Replaces the old direct-to-Google "Add to Google Calendar" button
// (2026-07-06 session decision): this step's calendar presence now lives in
// schedule_manager's own local sched_events table first (Design Lock #14) —
// pushing that local event on to Google is a separate action, done from
// inside schedule_manager's EventDetail, not from here.
export function MoveToScheduleButton({ step }) {
  const [status, setStatus] = useState('loading') // 'loading' | 'not-migrated' | 'migrated'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    getScheduleStatus(step.id)
      .then((schedEvent) => { if (!cancelled) setStatus(schedEvent ? 'migrated' : 'not-migrated') })
      .catch((e) => { if (!cancelled) { setStatus('not-migrated'); setErr(e.message || 'Status check failed') } })
    return () => { cancelled = true }
  }, [step.id])

  const toggle = async () => {
    setErr('')
    if (status === 'not-migrated' && !step.deadline) {
      setErr('Set a deadline first — Schedule needs a date to place this on.')
      return
    }
    setBusy(true)
    try {
      if (status === 'migrated') {
        await setScheduleMigration(step.id, false)
        setStatus('not-migrated')
      } else {
        await setScheduleMigration(step.id, true)
        setStatus('migrated')
      }
    } catch (e) {
      setErr(e.message || 'Failed to update Schedule')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return null

  return (
    <div>
      <button onClick={toggle} disabled={busy} style={S.trigger}>
        {busy ? 'Working…' : status === 'migrated' ? '✓ In Schedule — tap to remove' : '📅 Move to Schedule'}
      </button>
      {err && <div style={S.err}>{err}</div>}
    </div>
  )
}

const S = {
  trigger: { alignSelf: 'flex-start', marginTop: 4, background: 'transparent',
    color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: '6px 12px', cursor: 'pointer', fontSize: 12 },
  err: { color: COLORS.danger, fontSize: 12, marginTop: 4 },
}

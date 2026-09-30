import { useEffect, useState } from 'react'
import { COLORS } from '../styles/theme'
import { getScheduleStatus, setScheduleMigration } from '../lib/scheduleExport'

// Replaces the old direct-to-Google "Add to Google Calendar" button
// (2026-07-06 session decision): this step's calendar presence now lives in
// schedule_manager's own local sched_events table first (Design Lock #14) —
// pushing that local event on to Google is a separate action, done from
// inside schedule_manager's EventDetail, not from here.
// initialMigrated: when the parent already knows this step's calendar state
// (ProjectModal fetches all of them in one statusBatch call), pass it in and
// this component skips its own per-step round trip. Undefined means "unknown",
// and the old single-step fetch runs.
// onChange: lets the parent update its own mark without a refetch.
export function MoveToScheduleButton({ step, initialMigrated, onChange }) {
  const [status, setStatus] = useState(
    initialMigrated === undefined ? 'loading' : (initialMigrated ? 'migrated' : 'not-migrated'),
  ) // 'loading' | 'not-migrated' | 'migrated'
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (initialMigrated !== undefined) {
      setStatus(initialMigrated ? 'migrated' : 'not-migrated')
      return
    }
    let cancelled = false
    getScheduleStatus(step.id)
      .then((schedEvent) => { if (!cancelled) setStatus(schedEvent ? 'migrated' : 'not-migrated') })
      .catch((e) => { if (!cancelled) { setStatus('not-migrated'); setErr(e.message || 'Status check failed') } })
    return () => { cancelled = true }
  }, [step.id, initialMigrated])

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
        onChange?.(step.id, false)
      } else {
        await setScheduleMigration(step.id, true)
        setStatus('migrated')
        onChange?.(step.id, true)
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

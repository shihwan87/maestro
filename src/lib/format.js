import { COLORS } from '../styles/theme'

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86400000)
}

// Earliest non-Done step deadline; fall back to project.deadline.
// Returns { date: 'YYYY-MM-DD', source: 'step' | 'project' } or null.
export function effectiveDeadline(project, steps) {
  const upcoming = (steps || []).filter(s => s.status !== 'Done' && s.deadline)
  let earliest = null
  for (const s of upcoming) {
    if (!earliest || s.deadline < earliest) earliest = s.deadline
  }
  if (earliest) return { date: earliest, source: 'step' }
  if (project?.deadline) return { date: project.deadline, source: 'project' }
  return null
}

// D-day color bands: red ≤7d (and overdue), amber ≤30d, green >30d, grey none.
export function deadlineBadge(dateStr) {
  const n = daysUntil(dateStr)
  if (n === null) return { text: 'No deadline', color: COLORS.muted }
  if (n < 0) return { text: `D+${-n} overdue`, color: COLORS.danger }
  if (n === 0) return { text: 'D-day', color: COLORS.danger }
  if (n <= 7) return { text: `D-${n}`, color: COLORS.danger }
  if (n <= 30) return { text: `D-${n}`, color: COLORS.warn }
  return { text: `D-${n}`, color: COLORS.ok }
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Display a date as 'YY/MM/DD (Dow), e.g. '26/06/26 (Fri).
// Parse as local midnight to avoid UTC day-shift on YYYY-MM-DD strings.
export function formatYYMMDD(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr}T00:00:00`)
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `'${yy}/${mm}/${dd} (${DOW[d.getDay()]})`
}

export function progress(steps) {
  if (!steps || steps.length === 0) return { done: 0, total: 0, pct: 0 }
  const done = steps.filter(s => s.status === 'Done').length
  return { done, total: steps.length, pct: Math.round((done / steps.length) * 100) }
}

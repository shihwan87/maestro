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

export function deadlineBadge(dateStr) {
  const n = daysUntil(dateStr)
  if (n === null) return { text: 'No deadline', color: COLORS.muted }
  if (n < 0) return { text: `D+${-n} overdue`, color: COLORS.danger }
  if (n === 0) return { text: 'D-day', color: COLORS.danger }
  if (n <= 3) return { text: `D-${n}`, color: COLORS.danger }
  if (n <= 7) return { text: `D-${n}`, color: COLORS.warn }
  return { text: `D-${n}`, color: COLORS.muted }
}

export function formatYYMMDD(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}/${mm}/${dd}`
}

export function progress(steps) {
  if (!steps || steps.length === 0) return { done: 0, total: 0, pct: 0 }
  const done = steps.filter(s => s.status === 'Done').length
  return { done, total: steps.length, pct: Math.round((done / steps.length) * 100) }
}

import { COLORS } from '../styles/theme'

export function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86400000)
}

export function deadlineBadge(dateStr) {
  const n = daysUntil(dateStr)
  if (n === null) return { text: '마감 없음 / No deadline', color: COLORS.muted }
  if (n < 0) return { text: `D+${-n} (지남 / overdue)`, color: COLORS.danger }
  if (n === 0) return { text: 'D-day', color: COLORS.danger }
  if (n <= 3) return { text: `D-${n}`, color: COLORS.danger }
  if (n <= 7) return { text: `D-${n}`, color: COLORS.warn }
  return { text: `D-${n}`, color: COLORS.muted }
}

export function progress(steps) {
  if (!steps || steps.length === 0) return { done: 0, total: 0, pct: 0 }
  const done = steps.filter(s => s.status === 'Done').length
  return { done, total: steps.length, pct: Math.round((done / steps.length) * 100) }
}

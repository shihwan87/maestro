import { daysUntil } from './format'

// Overview bucket definitions. Pure functions — no network, no React — so the
// banding rule stays in one readable place and can be unit-tested.
//
// Bands (by days until the row's date):
//   overdue   d <  0
//   week      0 <= d <=  7
//   month     7 <  d <= 30
//   long      d > 30, or no date at all
//
// 'long' is the collapsed-by-default bucket.
export const BUCKETS = [
  { id: 'overdue', label: 'Past due',       collapsed: false },
  { id: 'week',    label: 'Due within 1 week',  collapsed: false },
  { id: 'month',   label: 'Due within 1 month', collapsed: false },
  { id: 'long',    label: 'Long term',       collapsed: true },
]

export function bucketOf(dateStr) {
  const d = daysUntil(dateStr)
  if (d === null) return 'long'
  if (d < 0) return 'overdue'
  if (d <= 7) return 'week'
  if (d <= 30) return 'month'
  return 'long'
}

// Sort by date ascending; undated rows last, then alphabetical so the order
// is stable across re-renders instead of following whatever the DB returned.
function byDateThenTitle(a, b) {
  if (a.date && b.date) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
  } else if (a.date) return -1
  else if (b.date) return 1
  return (a.title || '').localeCompare(b.title || '')
}

// rows -> { overdue: [], week: [], month: [], long: [] }, each date-sorted.
export function groupIntoBuckets(rows) {
  const out = { overdue: [], week: [], month: [], long: [] }
  for (const r of rows) out[bucketOf(r.date)].push(r)
  for (const k of Object.keys(out)) out[k].sort(byDateThenTitle)
  return out
}

// Short scope tag shown on every row: [W] / [P].
export function scopeTag(scope) {
  return scope === 'personal' ? 'P' : 'W'
}

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ARCHIVED } from '../lib/constants'

// Cross-scope feed for the OVERVIEW tab. Unlike useProjects (scope-isolated)
// this deliberately reads WORK and PERSONAL together, because Overview's whole
// point is one time-ordered list across both.
//
// A row is one pending *step* — the unit the user thinks of as "a task" —
// carrying its parent project's title/scope/category for the small header.
// A non-Done, non-Archived project that has no pending step but does have its
// own deadline still gets one row (kind: 'project'), so setting a deadline on
// a project and no steps can never make it silently disappear from Overview.
//
// Returns { rows, projectsById, loading, refresh }. Bucketing lives in
// src/lib/overview.js so it stays testable without a network.
export function useAllPending() {
  const [rows, setRows] = useState([])
  const [projectsById, setProjectsById] = useState(new Map())
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: projects, error: pErr }, { data: steps, error: sErr }] = await Promise.all([
      supabase.from('projects').select('*'),
      supabase.from('steps').select('*'),
    ])
    if (pErr || sErr) {
      console.error('[useAllPending]', pErr || sErr)
      setLoading(false)
      return
    }

    const byId = new Map()
    for (const p of projects ?? []) byId.set(p.id, p)

    // Projects eligible to contribute rows at all.
    const eligible = (projects ?? []).filter(
      p => p.category !== ARCHIVED && p.status !== 'Done',
    )
    const eligibleIds = new Set(eligible.map(p => p.id))

    const out = []
    const projectsWithPendingStep = new Set()

    for (const s of steps ?? []) {
      if (s.status === 'Done') continue
      if (!eligibleIds.has(s.project_id)) continue
      const p = byId.get(s.project_id)
      projectsWithPendingStep.add(p.id)
      out.push({
        kind: 'step',
        id: s.id,
        title: s.title,
        date: s.deadline || null,
        status: s.status,
        step: s,
        project: p,
      })
    }

    for (const p of eligible) {
      if (projectsWithPendingStep.has(p.id)) continue
      if (!p.deadline) continue
      out.push({
        kind: 'project',
        id: `project:${p.id}`,
        title: p.title,
        date: p.deadline,
        status: p.status,
        step: null,
        project: p,
      })
    }

    setProjectsById(byId)
    setRows(out)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('overview-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'steps' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  return { rows, projectsById, loading, refresh: fetchAll }
}

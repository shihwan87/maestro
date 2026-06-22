import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Dashboard-wide fetch: one query returns all steps grouped by project_id.
// Used to compute project D-day and urgency without N queries per card.
export function useStepsByProject() {
  const [map, setMap] = useState(new Map())

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('steps')
      .select('id, project_id, status, deadline')
    if (error) { console.error(error); return }
    const m = new Map()
    for (const s of data ?? []) {
      if (!m.has(s.project_id)) m.set(s.project_id, [])
      m.get(s.project_id).push(s)
    }
    setMap(m)
  }, [])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('all-steps-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'steps' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  return { stepsByProject: map, refresh: fetchAll }
}

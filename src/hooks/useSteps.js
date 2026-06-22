import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useSteps(projectId) {
  const [steps, setSteps] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!projectId) { setSteps([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('steps')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
    if (!error) setSteps(data ?? [])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    fetchAll()
    if (!projectId) return
    const channel = supabase
      .channel(`steps-${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'steps', filter: `project_id=eq.${projectId}` },
        fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, fetchAll])

  const addStep = async ({ title, notes = '' }) => {
    const sort_order = steps.length
    const { data, error } = await supabase
      .from('steps')
      .insert({ project_id: projectId, title, notes, sort_order })
      .select().single()
    if (error) throw error
    return data
  }

  const updateStep = async (id, patch) => {
    const { error } = await supabase.from('steps').update(patch).eq('id', id)
    if (error) throw error
  }

  const deleteStep = async (id) => {
    const { error } = await supabase.from('steps').delete().eq('id', id)
    if (error) throw error
  }

  return { steps, loading, addStep, updateStep, deleteStep, refresh: fetchAll }
}

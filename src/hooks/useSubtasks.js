import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useSubtasks(stepId) {
  const [subtasks, setSubtasks] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!stepId) { setSubtasks([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('subtasks')
      .select('*')
      .eq('step_id', stepId)
      .order('sort_order', { ascending: true })
    if (!error) setSubtasks(data ?? [])
    setLoading(false)
  }, [stepId])

  useEffect(() => {
    fetchAll()
    if (!stepId) return
    const channel = supabase
      .channel(`subtasks-${stepId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'subtasks', filter: `step_id=eq.${stepId}` },
        fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [stepId, fetchAll])

  const addSubtask = async (text) => {
    const sort_order = subtasks.length
    const { data, error } = await supabase
      .from('subtasks')
      .insert({ step_id: stepId, text, sort_order })
      .select().single()
    if (error) throw error
    return data
  }

  const updateSubtask = async (id, patch) => {
    const { error } = await supabase.from('subtasks').update(patch).eq('id', id)
    if (error) throw error
  }

  const deleteSubtask = async (id) => {
    const { error } = await supabase.from('subtasks').delete().eq('id', id)
    if (error) throw error
  }

  return { subtasks, loading, addSubtask, updateSubtask, deleteSubtask, refresh: fetchAll }
}

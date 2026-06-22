import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('deadline', { ascending: true, nullsFirst: false })
    if (error) setError(error)
    else setProjects(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('projects-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchAll])

  const addProject = async ({ title, category, deadline }) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ title, category, deadline })
      .select()
      .single()
    if (error) throw error
    return data
  }

  const updateProject = async (id, patch) => {
    const { error } = await supabase.from('projects').update(patch).eq('id', id)
    if (error) throw error
  }

  const deleteProject = async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) throw error
  }

  return { projects, loading, error, addProject, updateProject, deleteProject, refresh: fetchAll }
}

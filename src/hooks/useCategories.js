import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error) setCategories(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('categories-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  const addCategory = async ({ name, color }) => {
    const { error } = await supabase.from('categories').insert({ name, color })
    if (error) throw error
  }

  const updateCategory = async (id, patch) => {
    // If renaming, propagate to projects.category
    const current = categories.find(c => c.id === id)
    if (current && patch.name && patch.name !== current.name) {
      await supabase.from('projects').update({ category: patch.name }).eq('category', current.name)
    }
    const { error } = await supabase.from('categories').update(patch).eq('id', id)
    if (error) throw error
  }

  const deleteCategory = async (id) => {
    // The DB trigger reassigns linked projects to 'Uncategorized'
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw error
  }

  const colorFor = (name) => categories.find(c => c.name === name)?.color || '#8a8fa3'

  return { categories, loading, addCategory, updateCategory, deleteCategory, colorFor, refresh: fetchAll }
}

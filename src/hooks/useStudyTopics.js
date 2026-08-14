import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { buildTree } from '../lib/studyTree'

export function useStudyTopics() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('study_topics')
      .select('*')
      .order('sort_order', { ascending: true })
    if (!error) setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('study-topics-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_topics' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  const tree = buildTree(rows)

  const siblingsOf = (parentId) =>
    rows.filter(r => (r.parent_id || null) === (parentId || null))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const addTopic = async ({ parentId = null, title, notes = '' }) => {
    const sort_order = siblingsOf(parentId).length
    const { data, error } = await supabase
      .from('study_topics')
      .insert({ parent_id: parentId, title, notes, sort_order })
      .select().single()
    if (error) throw error
    await fetchAll()
    return data
  }

  const updateTopic = async (id, patch) => {
    const { error } = await supabase.from('study_topics').update(patch).eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  const deleteTopic = async (id) => {
    const { error } = await supabase.from('study_topics').delete().eq('id', id)
    if (error) throw error
    await fetchAll()
  }

  // Persist a full sibling ordering under one parent — used by indent/outdent,
  // which only ever touch a single destination parent's children.
  const reorderSiblings = async (parentId, orderedIds) => {
    await Promise.all(orderedIds.map((id, idx) =>
      supabase.from('study_topics').update({ sort_order: idx, parent_id: parentId }).eq('id', id)
    ))
    await fetchAll()
  }

  const moveTopic = async (id, newParentId, newIndex) => {
    const destSiblings = siblingsOf(newParentId).filter(r => r.id !== id).map(r => r.id)
    destSiblings.splice(newIndex, 0, id)
    await reorderSiblings(newParentId, destSiblings)
  }

  // Drag-and-drop end: apply a precomputed {id, parent_id, sort_order}[]
  // patch (see studyTree.reconcileParents) in one batch.
  const applyReconciled = async (patch) => {
    await Promise.all(patch.map(p =>
      supabase.from('study_topics')
        .update({ parent_id: p.parent_id, sort_order: p.sort_order })
        .eq('id', p.id)
    ))
    await fetchAll()
  }

  const indentTopic = (id) => {
    const node = rows.find(r => r.id === id)
    if (!node) return
    const sibs = siblingsOf(node.parent_id)
    const idx = sibs.findIndex(r => r.id === id)
    if (idx <= 0) return // no previous sibling to become the new parent
    const newParent = sibs[idx - 1]
    const newParentChildCount = siblingsOf(newParent.id).length
    return moveTopic(id, newParent.id, newParentChildCount)
  }

  const outdentTopic = (id) => {
    const node = rows.find(r => r.id === id)
    if (!node || !node.parent_id) return // already at root
    const parent = rows.find(r => r.id === node.parent_id)
    const grandparentId = parent ? parent.parent_id : null
    const newSibs = siblingsOf(grandparentId)
    const parentIdx = newSibs.findIndex(r => r.id === parent.id)
    return moveTopic(id, grandparentId, parentIdx + 1)
  }

  // Wipe the whole tree and rebuild from a nested import structure. Parents
  // are inserted before children so each child can reference the freshly
  // created parent id.
  const replaceAll = async (nestedNodes) => {
    const { error: delErr } = await supabase.from('study_topics').delete().not('id', 'is', null)
    if (delErr) throw delErr

    const insertLevel = async (nodes, parentId) => {
      let order = 0
      for (const node of nodes) {
        const { data, error } = await supabase
          .from('study_topics')
          .insert({ parent_id: parentId, title: node.title, notes: node.notes || '', sort_order: order })
          .select().single()
        if (error) throw error
        order += 1
        if (node.children?.length) await insertLevel(node.children, data.id)
      }
    }
    await insertLevel(nestedNodes, null)
    await fetchAll()
  }

  return {
    rows, tree, loading, addTopic, updateTopic, deleteTopic,
    reorderSiblings, moveTopic, applyReconciled, indentTopic, outdentTopic,
    replaceAll, refresh: fetchAll,
  }
}

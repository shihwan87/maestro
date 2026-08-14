import { useState, useRef, useMemo } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { COLORS } from '../styles/theme'
import { useStudyTopics } from '../hooks/useStudyTopics'
import { StudyTopicRow } from './StudyTopicRow'
import {
  flattenVisible, getProjection, reconcileParents,
  toExportable, isValidImportShape, countNodes, countDescendants,
} from '../lib/studyTree'

const INDENT_WIDTH = 22

export function StudyTab() {
  const {
    tree, loading, addTopic, updateTopic, deleteTopic,
    indentTopic, outdentTopic, applyReconciled, replaceAll,
  } = useStudyTopics()

  const [collapsed, setCollapsed] = useState(() => new Set())
  const [newRoot, setNewRoot] = useState('')
  const [pendingImport, setPendingImport] = useState(null) // { nodes, fileName }
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
  )

  const flat = useMemo(() => flattenVisible(tree, collapsed), [tree, collapsed])
  const totalCount = useMemo(() => countNodes(tree), [tree])

  const toggleCollapse = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const findNode = (id, nodes = tree) => {
    for (const n of nodes) {
      if (n.id === id) return n
      const found = findNode(id, n.children)
      if (found) return found
    }
    return null
  }

  const submitRoot = async (e) => {
    e.preventDefault()
    if (!newRoot.trim()) return
    await addTopic({ parentId: null, title: newRoot.trim() })
    setNewRoot('')
  }

  const addChild = async (parentId, title) => {
    await addTopic({ parentId, title })
    setCollapsed(prev => { const next = new Set(prev); next.delete(parentId); return next })
  }

  const onDragEnd = async (e) => {
    const { active, over, delta } = e
    if (!over || active.id === over.id) return
    const proj = getProjection(flat, active.id, over.id, delta.x, INDENT_WIDTH)
    if (!proj) return
    const activeIdx = flat.findIndex(i => i.id === active.id)
    const overIdx = flat.findIndex(i => i.id === over.id)
    const reordered = arrayMove(flat, activeIdx, overIdx)
    const withDepth = reordered.map(item =>
      item.id === active.id ? { id: item.id, depth: proj.depth } : { id: item.id, depth: item.depth }
    )
    const patch = reconcileParents(withDepth)
    await applyReconciled(patch)
  }

  const doExport = () => {
    const data = toExportable(tree)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `maestro-study-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError('')
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!isValidImportShape(parsed)) {
        setImportError('That file doesn\'t look like a Study export (expected an array of {title, notes, children}).')
        return
      }
      setPendingImport({ nodes: parsed, fileName: file.name })
    } catch {
      setImportError('Could not read that file as JSON.')
    }
  }

  const confirmImport = async () => {
    if (!pendingImport) return
    await replaceAll(pendingImport.nodes)
    setPendingImport(null)
  }

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={S.headTitle}>Study</div>
        <div style={S.headBtns}>
          <button onClick={doExport} style={S.headBtn}>Export</button>
          <button onClick={() => fileInputRef.current?.click()} style={S.headBtn}>Import</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json"
            style={{ display: 'none' }} onChange={onFileChosen} />
        </div>
      </div>

      {importError && <div style={S.errorBanner}>{importError}</div>}

      {pendingImport && (
        <div style={S.confirmBanner}>
          <span>
            Replace all {totalCount} current topics with {countNodes(pendingImport.nodes)} from
            "{pendingImport.fileName}"?
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={confirmImport} style={S.confirmBtn}>Replace</button>
            <button onClick={() => setPendingImport(null)} style={S.cancelBtn}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div style={S.empty}>Loading…</div>}
      {!loading && tree.length === 0 && <div style={S.empty}>No topics yet. Add one below.</div>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={flat.map(n => n.id)} strategy={verticalListSortingStrategy}>
          <div style={S.list}>
            {flat.map(node => {
              const parent = node.parent_id ? findNode(node.parent_id) : null
              const canOutdent = !!node.parent_id
              const canIndent = (() => {
                // Can indent only if there's a previous sibling to nest under.
                const siblings = parent ? parent.children : tree
                const idx = siblings.findIndex(s => s.id === node.id)
                return idx > 0
              })()
              return (
                <StudyTopicRow
                  key={node.id}
                  node={node}
                  depth={node.depth}
                  hasChildren={node.hasChildren}
                  collapsed={collapsed.has(node.id)}
                  onToggleCollapse={toggleCollapse}
                  onUpdate={updateTopic}
                  onDelete={async (id) => {
                    const target = findNode(id)
                    const n = target ? countDescendants(target) : 0
                    if (n > 0 && !window.confirm(`Delete "${target.title}" and its ${n} subtopic${n === 1 ? '' : 's'}?`)) return
                    await deleteTopic(id)
                  }}
                  onIndent={() => indentTopic(node.id)}
                  onOutdent={() => outdentTopic(node.id)}
                  onAddChild={addChild}
                  canIndent={canIndent}
                  canOutdent={canOutdent}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      <form onSubmit={submitRoot} style={S.addRow}>
        <input value={newRoot} onChange={e => setNewRoot(e.target.value)}
          placeholder="New topic" style={S.addInput} />
        <button type="submit" style={S.addBtn}>+ Add topic</button>
      </form>
    </div>
  )
}

const S = {
  wrap: { padding: '12px 16px 32px', maxWidth: 720, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headTitle: { color: COLORS.text, fontSize: 18, fontWeight: 700 },
  headBtns: { display: 'flex', gap: 8 },
  headBtn: { background: 'transparent', color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 },
  errorBanner: { background: 'rgba(255,107,107,0.12)', color: COLORS.danger, borderRadius: 8,
    padding: '8px 12px', fontSize: 13, marginBottom: 10 },
  confirmBanner: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: '10px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: COLORS.text },
  confirmBtn: { background: COLORS.danger, color: '#fff', border: 0, borderRadius: 8,
    padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  cancelBtn: { background: 'transparent', color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 },
  empty: { color: COLORS.muted, fontSize: 13, padding: '12px 4px' },
  list: { display: 'flex', flexDirection: 'column', border: `1px solid ${COLORS.border}`,
    borderRadius: 10, overflow: 'hidden', background: COLORS.card },
  addRow: { display: 'flex', gap: 6, marginTop: 12 },
  addInput: { flex: 1, background: COLORS.bg, color: COLORS.text, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none' },
  addBtn: { background: COLORS.primary, color: '#fff', border: 0, borderRadius: 8,
    padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
}

// Pure tree helpers for the Study tab. The DB stores a flat list of rows
// (id, parent_id, sort_order); everything here converts between that and the
// nested/flattened shapes the UI and drag-and-drop logic need.

export function buildTree(rows) {
  const byParent = new Map()
  for (const row of rows) {
    const key = row.parent_id || 'root'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(row)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }
  const attach = (row) => ({ ...row, children: (byParent.get(row.id) || []).map(attach) })
  return (byParent.get('root') || []).map(attach)
}

// Depth-first flatten of only the visible (non-collapsed) rows, tagged with
// depth for indentation and for the drag-depth projection math.
export function flattenVisible(tree, collapsedIds, depth = 0, out = []) {
  for (const node of tree) {
    const hasChildren = node.children.length > 0
    out.push({ ...node, depth, hasChildren })
    if (hasChildren && !collapsedIds.has(node.id)) {
      flattenVisible(node.children, collapsedIds, depth + 1, out)
    }
  }
  return out
}

export function countDescendants(node) {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0)
}

function arrayMoveLocal(arr, from, to) {
  const copy = arr.slice()
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

// dnd-kit "sortable tree" style projection: given the flattened list, where
// the drag would land (overId), and how far it was dragged horizontally,
// work out what depth — and therefore what parent — the drop represents.
export function getProjection(flatItems, activeId, overId, dragOffsetX, indentWidth = 22) {
  const overIndex = flatItems.findIndex(i => i.id === overId)
  const activeIndex = flatItems.findIndex(i => i.id === activeId)
  if (overIndex < 0 || activeIndex < 0) return null

  const reordered = arrayMoveLocal(flatItems, activeIndex, overIndex)
  const previousItem = reordered[overIndex - 1]
  const nextItem = reordered[overIndex + 1]
  const activeItem = flatItems[activeIndex]

  const projectedDepth = activeItem.depth + Math.round(dragOffsetX / indentWidth)
  const maxDepth = previousItem ? previousItem.depth + 1 : 0
  const minDepth = nextItem ? nextItem.depth : 0
  const depth = Math.min(Math.max(projectedDepth, minDepth), maxDepth)

  let parentId = null
  if (depth > 0 && previousItem) {
    if (depth === previousItem.depth) {
      parentId = previousItem.parent_id
    } else if (depth > previousItem.depth) {
      parentId = previousItem.id
    } else {
      const landingParent = reordered.slice(0, overIndex).reverse().find(i => i.depth === depth)
      parentId = landingParent ? landingParent.parent_id : null
    }
  }
  return { depth, parentId, reordered }
}

// Decode a final on-screen order (with each row's resolved depth) back into
// {id, parent_id, sort_order} rows, by walking a "most recent ancestor at
// each depth" stack — the standard decode for an indented-tree encoding.
// Only rows present in `orderedFlat` are returned; collapsed/hidden
// descendants are left untouched since their parent didn't move.
export function reconcileParents(orderedFlat) {
  const stack = []
  const siblingCounters = new Map()
  const result = []
  for (const item of orderedFlat) {
    const parentId = item.depth > 0 ? (stack[item.depth - 1] ?? null) : null
    stack[item.depth] = item.id
    stack.length = item.depth + 1
    const key = parentId || 'root'
    const order = siblingCounters.get(key) ?? 0
    siblingCounters.set(key, order + 1)
    result.push({ id: item.id, parent_id: parentId, sort_order: order })
  }
  return result
}

// Nested tree -> plain exportable JSON (drops db-only fields).
export function toExportable(tree) {
  return tree.map(n => ({
    title: n.title,
    notes: n.notes || '',
    children: toExportable(n.children),
  }))
}

export function isValidImportShape(data) {
  return Array.isArray(data) && data.every(isValidNode)
}

function isValidNode(n) {
  if (!n || typeof n !== 'object') return false
  if (typeof n.title !== 'string' || !n.title.trim()) return false
  if (n.children !== undefined && !Array.isArray(n.children)) return false
  return (n.children || []).every(isValidNode)
}

export function countNodes(nodes) {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children || []), 0)
}

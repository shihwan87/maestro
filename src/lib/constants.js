// Reserved category name (per scope) that projects auto-move into when every
// step is Done. Excluded from filter chips other than its own, from the urgent
// banner, and from the tab-marker deadline scan. Restore is manual: user opens
// the project and edits its category back to something else.
export const ARCHIVED = 'Archived'

// Pseudo-category shown as a chip inside the WORK tab (Phase 11). It is NOT a
// row in `categories` — Study data lives in its own `study_topics` tree with
// unlimited depth, which the two-level projects/steps model cannot represent.
// The chip is purely a navigation affordance so Study sits "under Work"
// without flattening the tree.
export const STUDY = 'Study'

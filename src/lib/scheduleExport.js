// Purpose: schemanager's side of the migrate/un-migrate toggle — calls
// schedule_manager's task-export Edge Function directly (shared Supabase
// project, see schedule_manager/interface_contract.md module 13).
// Inputs/outputs: stepId in, the linked sched_events row (or null) out.
// Architecture note: schemanager has no real Supabase Auth session (single-
// PIN app), so task-export can't identify "which user" from a JWT the way
// event-crud does — it resolves the app's one real user server-side
// instead (see task-export/index.ts). The `status` action exists only so
// this file can ask "is this step already migrated" without a way to read
// sched_events directly (RLS blocks an unauthenticated read).

import { supabase } from './supabase'

export async function getScheduleStatus(stepId) {
  const { data, error } = await supabase.functions.invoke('task-export', {
    body: { action: 'status', stepId },
  })
  if (error) throw new Error(error.message || 'Failed to check Schedule status')
  return data.schedEvent
}

export async function setScheduleMigration(stepId, enabled, deleteScope) {
  const { data, error } = await supabase.functions.invoke('task-export', {
    body: { action: 'migrate', stepId, enabled, ...(deleteScope ? { deleteScope } : {}) },
  })
  if (error) throw new Error(error.message || 'Failed to update Schedule')
  return data.schedEvent
}

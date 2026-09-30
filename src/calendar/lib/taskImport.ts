// Purpose: the reverse of schemanager's MoveToScheduleButton — turn a calendar
// event into a task (a `steps` row) in the TASKS side of the app, and link the
// two so the event shows as task-linked afterwards.
//
// Architecture note: `projects`/`steps` are schemanager's own tables. They have
// RLS enabled with an allow-all policy for both `anon` and `authenticated`
// (migration_011), so this app's logged-in client can read and write them
// directly — no Edge Function needed. sched_events, by contrast, is per-user
// RLS-scoped, and the update below runs as the owning user.
//
// A `steps` row needs a parent project, and an event has no way to infer one,
// so the caller must pass the target project id (the UI asks).

import { supabase } from './supabase';

export interface TaskTargetProject {
  id: string;
  title: string;
  scope: 'work' | 'personal';
  category: string | null;
}

// Non-archived, non-Done projects from both scopes, grouped work-first so the
// picker reads in the same order as the TASKS tab bar.
export async function fetchTaskTargets(): Promise<TaskTargetProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, title, scope, category, status')
    .neq('category', 'Archived')
    .neq('status', 'Done')
    .order('title', { ascending: true });
  if (error) {
    console.error('[taskImport] fetchTaskTargets failed', error);
    throw error;
  }
  const rows = (data ?? []) as Array<TaskTargetProject & { status: string }>;
  return rows
    .map(({ id, title, scope, category }) => ({ id, title, scope, category }))
    .sort((a, b) => (a.scope === b.scope ? 0 : a.scope === 'work' ? -1 : 1));
}

// Local YYYY-MM-DD for a timestamptz. `steps.deadline` is a date column, so
// using the ISO string's UTC date would shift the day for evening events in
// KST — take the local calendar date instead.
function localDate(ts: string): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export interface CreateTaskFromEventResult {
  stepId: string;
  projectId: string;
}

// Creates the step, then (when `link` is true) points the event's task_id at
// it. The link write is best-effort-ordered: if it fails the step still exists
// (visible in TASKS), which is the less confusing half to keep.
//
// `link` must be false for imported Google events. task-sync-webhook treats a
// task_id-linked event as owned by its step — deleting the step deletes the
// event, and renaming the step renames it — which would let a TASKS-side edit
// silently mutate or delete a real Google Calendar entry. Only events this app
// created ('app' source) may be linked.
export async function createTaskFromEvent(
  event: { id: string; title: string; description: string | null; start_ts: string },
  projectId: string,
  link: boolean,
): Promise<CreateTaskFromEventResult> {
  // Append at the end of the project's existing steps.
  const { count, error: countError } = await supabase
    .from('steps')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (countError) {
    console.error('[taskImport] step count failed', countError);
    throw countError;
  }

  const { data: step, error: insertError } = await supabase
    .from('steps')
    .insert({
      project_id: projectId,
      title: event.title,
      notes: event.description ?? '',
      deadline: localDate(event.start_ts),
      status: 'Not Started',
      sort_order: count ?? 0,
    })
    .select('id')
    .single();
  if (insertError || !step) {
    console.error('[taskImport] step insert failed', insertError);
    throw insertError ?? new Error('Step insert returned no row');
  }

  if (!link) return { stepId: step.id as string, projectId };

  const { error: linkError } = await supabase
    .from('sched_events')
    .update({ task_id: step.id })
    .eq('id', event.id);
  if (linkError) {
    console.error('[taskImport] linking event to step failed', linkError);
    throw new Error(
      `Task created, but linking it back to this event failed: ${linkError.message}`,
    );
  }

  return { stepId: step.id as string, projectId };
}

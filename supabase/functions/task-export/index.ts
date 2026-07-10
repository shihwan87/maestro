// Purpose: migrate/un-migrate toggle — "is this schemanager step in
// schedule_manager's local calendar at all" (Design Lock #14, local-first).
// Pushing the resulting local event to Google is a separate action
// (event-crud's push/unpush), not part of this endpoint.
// Inputs: a discriminated request body — see TaskExportAction below.
// **Addition beyond interface_contract.md's TaskExportRequest**: a
// `{ action: 'status', stepId }` variant, read-only, no side effects.
// Reason: schemanager (the caller) has no way to read sched_events directly
// to know "is this step already migrated" — RLS on sched_events requires a
// real Supabase Auth session, which schemanager doesn't have (see note
// below) — so the only way to know current state is to ask this endpoint.
// Outputs: TaskExportResponse { schedEvent } for every action — the current/
// resulting row, or null if not migrated.
// Architecture note: called from schemanager, which has no real Supabase
// Auth session (single-PIN app, RLS off on its own tables) — there is no
// caller JWT to resolve a user from. Per the user's explicit decision
// (2026-07-06 session), this endpoint skips per-caller auth entirely and
// always resolves the app's one real Supabase Auth user via the admin API
// (resolveSoleUserId), the same single-tenant shortcut sync-run already
// uses (it loops sched_google_auth rows rather than assuming one user, but
// there is in practice exactly one). This means the anon key alone is
// sufficient to call this endpoint — acceptable for a personal project
// already running with RLS off end-to-end on the schemanager side.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { migrateStepToLocalEvent, deleteExportedEvent } from '../_shared/exporter.ts';
import { getValidAccessToken } from '../_shared/google-auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import type { DeleteScope, TaskExportResponse, TaskExportSource, SchedEvent } from '../_shared/types.ts';

type TaskExportAction =
  | { action: 'status'; stepId: string }
  | { action: 'migrate'; stepId: string; enabled: boolean; deleteScope?: DeleteScope };

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function resolveSoleUserId(): Promise<string> {
  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 1 });
  if (error) throw new Error(`resolveSoleUserId failed: ${error.message}`);
  const user = data.users[0];
  if (!user) throw new Error('resolveSoleUserId: no Supabase Auth user exists yet — connect via schedule_manager first');
  return user.id;
}

async function loadTaskExportSource(stepId: string): Promise<TaskExportSource> {
  const { data, error } = await adminClient()
    .from('steps')
    .select('id, title, deadline, status, gcal_event_id, project_id, projects(id, title, scope, category)')
    .eq('id', stepId)
    .single();
  if (error || !data) throw new Error(`loadTaskExportSource failed: ${error?.message ?? 'step not found'}`);

  const project = Array.isArray(data.projects) ? data.projects[0] : data.projects;
  if (!project) throw new Error(`loadTaskExportSource: step ${stepId} has no linked project`);

  return {
    stepId: data.id,
    stepTitle: data.title,
    stepDeadline: data.deadline,
    stepStatus: data.status,
    existingGcalEventId: data.gcal_event_id,
    projectId: project.id,
    projectTitle: project.title,
    projectScope: project.scope,
    projectCategory: project.category,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const body = (await req.json()) as TaskExportAction;

    if (body.action === 'status') {
      const { data: existing, error } = await adminClient()
        .from('sched_events')
        .select('*')
        .eq('task_id', body.stepId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const response: TaskExportResponse = { schedEvent: (existing as SchedEvent | null) ?? null };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = await resolveSoleUserId();

    if (body.enabled) {
      const source = await loadTaskExportSource(body.stepId);
      const schedEvent = await migrateStepToLocalEvent(source, userId);
      const response: TaskExportResponse = { schedEvent };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Un-migrate: find the linked local event, if any.
    const { data: existing, error: findError } = await adminClient()
      .from('sched_events')
      .select('*')
      .eq('task_id', body.stepId)
      .maybeSingle();
    if (findError) throw new Error(findError.message);

    if (existing) {
      const row = existing as SchedEvent;
      const accessToken = row.google_event_id ? await getValidAccessToken(row.user_id) : null;
      await deleteExportedEvent(row.id, accessToken, body.deleteScope ?? 'all');
    }

    const response: TaskExportResponse = { schedEvent: null };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('task-export failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Purpose: target URL for a Supabase Database Webhook on the `steps` table
// (Design Lock #10) — near-instant step title/deadline -> local event sync,
// and cascade delete when a migrated step is deleted.
// Inputs: DatabaseWebhookPayload<StepRow>, Supabase's native webhook shape
// (fires on every UPDATE/DELETE — filtering happens here, Supabase can't
// filter by a related table's column).
// Outputs: always 200 — Supabase's webhook delivery doesn't meaningfully
// retry on non-2xx, so errors are logged to sched_sync_log (calendar_id=
// 'webhook') instead of surfaced to the caller.
// Architecture note: the webhook itself (URL + secret) is a one-time manual
// Supabase Dashboard/CLI setup step, documented in NOTES_phase4.md — not
// something this file can configure itself.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { deleteExportedEvent, patchTaskLinkedEvent } from '../_shared/exporter.ts';
import { getValidAccessToken } from '../_shared/google-auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import type { SchedEvent } from '../_shared/types.ts';

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

interface StepRow {
  id: string;
  title: string;
  deadline: string | null;
}

interface DatabaseWebhookPayload<T> {
  type: 'UPDATE' | 'DELETE';
  table: 'steps';
  record: T | null;
  old_record: T | null;
}

async function logWebhookError(message: string): Promise<void> {
  await adminClient().from('sched_sync_log').insert({
    calendar_id: 'webhook',
    error: message,
    ran_at: new Date().toISOString(),
  });
}

// This URL is otherwise unauthenticated (a Database Webhook has no
// Supabase Auth session to verify) — flagged as an open item in
// interface_contract.md's J11. A shared secret configured as a custom HTTP
// header on the webhook (Supabase Dashboard) closes that gap; see
// NOTES_phase4.md for the one-time setup step.
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('TASK_SYNC_WEBHOOK_SECRET');
  if (!expected) return false; // must be configured — no accidental open-door default
  return req.headers.get('x-webhook-secret') === expected;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (!isAuthorized(req)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as DatabaseWebhookPayload<StepRow>;
    const step = payload.record ?? payload.old_record;
    if (!step) return new Response('ok', { status: 200, headers: corsHeaders });

    const { data: existing, error } = await adminClient()
      .from('sched_events')
      .select('*')
      .eq('task_id', step.id)
      .maybeSingle();
    if (error) {
      await logWebhookError(`lookup failed: ${error.message}`);
      return new Response('ok', { status: 200, headers: corsHeaders });
    }
    if (!existing) return new Response('ok', { status: 200, headers: corsHeaders }); // never migrated

    const row = existing as SchedEvent;

    if (payload.type === 'DELETE') {
      const accessToken = row.google_event_id ? await getValidAccessToken(row.user_id) : null;
      await deleteExportedEvent(row.id, accessToken, 'all');
      return new Response('ok', { status: 200, headers: corsHeaders });
    }

    // type === 'UPDATE'
    const oldStep = payload.old_record;
    const titleChanged = oldStep && step.title !== oldStep.title;
    const deadlineChanged = oldStep && step.deadline !== oldStep.deadline;
    if (!titleChanged && !deadlineChanged) {
      return new Response('ok', { status: 200, headers: corsHeaders });
    }
    if (deadlineChanged && !step.deadline) {
      // Deadline cleared entirely — nothing sensible to patch the event's
      // date to; leave the local event as-is rather than guessing.
      return new Response('ok', { status: 200, headers: corsHeaders });
    }
    await patchTaskLinkedEvent(row.id, {
      ...(titleChanged ? { title: step.title } : {}),
      ...(deadlineChanged ? { date: step.deadline! } : {}),
    });
    return new Response('ok', { status: 200, headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('task-sync-webhook failed', message);
    await logWebhookError(message).catch(() => {});
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
});

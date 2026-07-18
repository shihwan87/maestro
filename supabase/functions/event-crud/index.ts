// Purpose: manual entry point for any app-owned event's create/update/
// delete/push/un-push (Design Lock #14) — both freestanding and
// task-linked (a migrated step's local event). Called from
// schedule_manager's frontend, which has a real Supabase Auth session.
// Inputs: EventCrudRequest (discriminated union by `action`), Authorization
// header carrying the caller's Supabase JWT.
// Outputs: EventCrudResponse { schedEvent } — null on successful delete.
// Architecture note: unlike task-export (schemanager, no login, see that
// file's note), this endpoint resolves userId from the caller's own JWT
// (same pattern as google-oauth-callback's leg 1) since schedule_manager
// always has a real logged-in user.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  createOrUpdateFreestandingEvent,
  createOverrideInstance,
  deleteExportedEvent,
  pushEventToGoogle,
  splitRecurringEvent,
  unpushEventFromGoogle,
} from '../_shared/exporter.ts';
import { getValidAccessToken } from '../_shared/google-auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import type { EventCrudRequest, EventCrudResponse, SchedEvent } from '../_shared/types.ts';

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function userIdFromAuthHeader(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Missing Authorization header');
  const jwt = authHeader.replace(/^Bearer /i, '');
  const { data, error } = await adminClient().auth.getUser(jwt);
  if (error || !data.user) throw new Error('Invalid session');
  return data.user.id;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const userId = await userIdFromAuthHeader(req);
    const body = (await req.json()) as EventCrudRequest;

    switch (body.action) {
      case 'create': {
        const schedEvent = await createOrUpdateFreestandingEvent(body.input, userId);
        return jsonResponse({ schedEvent } satisfies EventCrudResponse);
      }
      case 'update': {
        const schedEvent = await createOrUpdateFreestandingEvent(
          { ...body.input, schedEventId: body.schedEventId },
          userId,
        );
        return jsonResponse({ schedEvent } satisfies EventCrudResponse);
      }
      case 'delete': {
        const { data: existing, error } = await adminClient()
          .from('sched_events')
          .select('*')
          .eq('id', body.schedEventId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        const row = existing as SchedEvent | null;
        const accessToken = row?.google_event_id ? await getValidAccessToken(userId) : null;
        await deleteExportedEvent(body.schedEventId, accessToken, body.deleteScope, body.occurrenceStartTs);
        return jsonResponse({ schedEvent: null } satisfies EventCrudResponse);
      }
      case 'push': {
        const accessToken = await getValidAccessToken(userId);
        const schedEvent = await pushEventToGoogle(body.schedEventId, accessToken);
        return jsonResponse({ schedEvent } satisfies EventCrudResponse);
      }
      case 'unpush': {
        const accessToken = await getValidAccessToken(userId);
        const schedEvent = await unpushEventFromGoogle(body.schedEventId, accessToken);
        return jsonResponse({ schedEvent } satisfies EventCrudResponse);
      }
      case 'createOverride': {
        const schedEvent = await createOverrideInstance(
          body.masterId,
          body.occurrenceStartTs,
          body.input,
          userId,
        );
        return jsonResponse({ schedEvent } satisfies EventCrudResponse);
      }
      case 'editFuture': {
        const schedEvent = await splitRecurringEvent(
          body.masterId,
          body.occurrenceStartTs,
          body.input,
          userId,
        );
        return jsonResponse({ schedEvent } satisfies EventCrudResponse);
      }
      default:
        return jsonResponse({ error: 'Unknown action' }, 400);
    }
  } catch (err) {
    console.error('event-crud failed', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: message }, 500);
  }
});

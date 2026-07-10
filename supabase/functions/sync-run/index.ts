// Purpose: entry point for the Google Calendar sync loop (Design Lock #4).
// Runs on a 06:00/14:00/22:00 KST Supabase schedule, and manually via the
// "Sync now" button (supabase.functions.invoke('sync-run')).
// Inputs: optional SyncRunRequest.calendarIds to restrict which calendar(s)
// to sync; defaults to every calendar this app currently knows how to
// categorize. Scheduled invocations send no body at all.
// Outputs: SyncRunResponse — one SyncResult per (user, calendar) pair
// synced. A single calendar's failure is carried in that SyncResult.error,
// not a top-level 500, so it never hides other calendars' results.
// Architecture note: single-tenant today, but loops over every row in
// sched_google_auth rather than assuming one fixed user, so a second user
// connecting later needs no change here. Holiday calendars (HOLIDAY_CAL_IDS)
// are wired in during Phase 7 (interface_contract.md module 12 describes
// the eventual full version) — this phase only syncs WORK_CAL_ID/
// PERSONAL_CAL_ID, per the source prompt's explicit "skip holidays this
// phase" for Phase 2.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { getValidAccessToken } from '../_shared/google-auth.ts';
import { importCalendar } from '../_shared/importer.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import type { Category, SyncRunRequest, SyncRunResponse, SyncResult } from '../_shared/types.ts';

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function resolveCategory(calendarId: string): Category | null {
  if (calendarId === Deno.env.get('WORK_CAL_ID')) return 'work';
  if (calendarId === Deno.env.get('PERSONAL_CAL_ID')) return 'personal';
  // HOLIDAY_CAL_IDS recognition arrives in Phase 7 — an unrecognized
  // calendar id is skipped, not guessed at.
  return null;
}

function defaultCalendarIds(): string[] {
  return [Deno.env.get('WORK_CAL_ID'), Deno.env.get('PERSONAL_CAL_ID')].filter(
    (id): id is string => !!id,
  );
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  let calendarIds = defaultCalendarIds();
  if (req.method === 'POST') {
    try {
      const body = (await req.json()) as SyncRunRequest;
      if (body?.calendarIds?.length) calendarIds = body.calendarIds;
    } catch {
      // No/invalid JSON body — scheduled invocations send none, fall back
      // to the default calendar set.
    }
  }

  const supabase = adminClient();
  const { data: authRows, error: authError } = await supabase.from('sched_google_auth').select('user_id');
  if (authError) {
    return new Response(JSON.stringify({ error: authError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: SyncResult[] = [];
  for (const { user_id } of authRows ?? []) {
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(user_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const ranAt = new Date().toISOString();
      for (const calendarId of calendarIds) {
        results.push({
          calendarId,
          category: resolveCategory(calendarId) ?? 'work',
          eventsAdded: 0,
          eventsUpdated: 0,
          eventsDeleted: 0,
          error: `Google auth failed: ${message}`,
          ranAt,
        });
      }
      continue;
    }

    for (const calendarId of calendarIds) {
      const category = resolveCategory(calendarId);
      if (!category) continue; // unrecognized calendar id — nothing to map it to yet
      results.push(await importCalendar(user_id, calendarId, category, accessToken));
    }
  }

  const response: SyncRunResponse = { results };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

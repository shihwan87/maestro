// Purpose: frontend API wrapper around Supabase (direct table reads, RLS-
// scoped) and this app's own Edge Functions (supabase.functions.invoke).
// Inputs/outputs: see interface_contract.md module 20 for the full function
// list — Phase 1 (Google-connect), Phase 3a (event fetch/expand, sync
// trigger), and Phase 4 (create/update/delete/push/unpush) are all
// implemented now. fetchTasksForExport/toggleTaskMigration are NOT here —
// per the 2026-07-06 session decision, the migrate/un-migrate toggle lives
// in schemanager (calling task-export directly), not in this app.
// Architecture note: RLS means every sched_* query below is automatically
// scoped to the logged-in user — no explicit .eq('user_id', ...) needed.
// The event-crud invocations below rely on supabase.functions.invoke
// automatically attaching the caller's JWT (same mechanism as
// startGoogleConnect above), which event-crud/index.ts verifies server-side.

import { rrulestr } from 'rrule';
import { supabase } from './supabase';
import type {
  DateRange,
  DeleteScope,
  EventCrudRequest,
  EventCrudResponse,
  EventInstance,
  GoogleOAuthStartResponse,
  NewEventInput,
  SchedEvent,
  SyncResult,
  SyncRunResponse,
} from './types';

// Convert a real UTC ISO timestamp to a "floating" Date whose UTC numeric
// values equal the local date/time values. Used to make rrule.js treat BYDAY
// rules in local-time space instead of UTC space (prevents day-shift for
// events created before UTC midnight in positive-offset timezones like KST).
function toFloatingDate(utcTs: string): { floating: Date; offsetMs: number } {
  const d = new Date(utcTs);
  const floating = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()),
  );
  return { floating, offsetMs: d.getTime() - floating.getTime() };
}

export async function isGoogleConnected(): Promise<boolean> {
  const { data, error } = await supabase
    .from('sched_google_auth')
    .select('user_id')
    .maybeSingle();
  if (error) {
    console.error('[api] isGoogleConnected failed', error);
    return false;
  }
  return data !== null;
}

export async function startGoogleConnect(): Promise<void> {
  const { data, error } = await supabase.functions.invoke<GoogleOAuthStartResponse>(
    'google-oauth-callback',
    { body: {} },
  );
  if (error || !data) {
    throw new Error(`Failed to start Google connect: ${error?.message ?? 'no response'}`);
  }
  window.location.href = data.authUrl;
}

export function dayRange(date: string): DateRange {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// Half-open [Sun 00:00 local, next Sun 00:00 local). Matches dayRange's shape
// so fetchEvents' start_ts < end AND end_ts > start overlap filter picks up
// events partially overlapping the visible week (a Sun→Mon multi-day bar
// or a bar starting the previous week and ending this Wed).
export function weekRange(weekStart: string): DateRange {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function fetchEvents(range: DateRange): Promise<SchedEvent[]> {
  // Fetch three kinds of rows:
  // 1. Non-recurring, non-override rows that overlap the window
  // 2. Recurring masters (rrule is not null) — their own start_ts/end_ts
  //    describe only the first occurrence, so we can't filter by overlap
  // 3. Override rows (override_of_event_id is not null) — needed so
  //    expandForRange can replace/cancel specific occurrences
  const { data, error } = await supabase
    .from('sched_events')
    .select('*')
    .lt('start_ts', range.end)
    .or(`end_ts.gt.${range.start},rrule.not.is.null,override_of_event_id.not.is.null`)
    .order('start_ts', { ascending: true });
  if (error) {
    console.error('[api] fetchEvents failed', error);
    throw error;
  }
  return data ?? [];
}

export function expandForRange(events: SchedEvent[], range: DateRange): EventInstance[] {
  const windowStart = new Date(range.start);
  const windowEnd = new Date(range.end);
  const instances: EventInstance[] = [];

  // Collect override rows keyed by (masterId, overrideStartTs) so we can
  // replace or cancel specific occurrences during expansion below.
  const overrideMap = new Map<string, SchedEvent>();
  const masterIds = new Set<string>();
  for (const event of events) {
    if (event.override_of_event_id && event.override_start_ts) {
      const normTs = new Date(event.override_start_ts).toISOString();
      const key = `${event.override_of_event_id}|${normTs}`;
      overrideMap.set(key, event);
    }
    if (event.rrule) {
      masterIds.add(event.id);
    }
  }

  for (const event of events) {
    // Skip override rows — they're applied inside the master's expansion
    if (event.override_of_event_id) continue;

    if (!event.rrule) {
      const instanceStart = new Date(event.start_ts);
      const instanceEnd = new Date(event.end_ts);
      if (instanceStart < windowEnd && instanceEnd > windowStart) {
        instances.push({
          sourceEvent: event,
          instanceStartTs: event.start_ts,
          instanceEndTs: event.end_ts,
          isOverride: false,
          isRecurring: false,
        });
      }
      continue;
    }

    const durationMs = new Date(event.end_ts).getTime() - new Date(event.start_ts).getTime();
    const { floating: dtstart, offsetMs } = toFloatingDate(event.start_ts);
    let occurrences: Date[];
    try {
      const rule = rrulestr(event.rrule, { dtstart });
      occurrences = rule.between(
        new Date(windowStart.getTime() - offsetMs),
        new Date(windowEnd.getTime() - offsetMs),
        true,
      );
    } catch {
      console.warn(`[api] skipping event ${event.id}: bad rrule "${event.rrule}"`);
      continue;
    }
    for (const occurrenceStart of occurrences) {
      const realStart = new Date(occurrenceStart.getTime() + offsetMs);
      const realStartIso = realStart.toISOString();

      // Check if an override row exists for this occurrence slot
      const overrideKey = `${event.id}|${realStartIso}`;
      const override = overrideMap.get(overrideKey);

      if (override) {
        // Cancelled instance: override row with extended_props.cancelled
        const isCancelled = override.extended_props &&
          (override.extended_props as Record<string, unknown>).cancelled === true;
        if (isCancelled) continue; // skip this occurrence entirely

        // Modified instance: use override's own times and data
        const overrideStart = new Date(override.start_ts);
        const overrideEnd = new Date(override.end_ts);
        if (overrideStart < windowEnd && overrideEnd > windowStart) {
          instances.push({
            sourceEvent: override,
            instanceStartTs: override.start_ts,
            instanceEndTs: override.end_ts,
            isOverride: true,
            isRecurring: true,
          });
        }
      } else {
        const instanceEnd = new Date(realStart.getTime() + durationMs);
        instances.push({
          sourceEvent: event,
          instanceStartTs: realStartIso,
          instanceEndTs: instanceEnd.toISOString(),
          isOverride: false,
          isRecurring: true,
        });
      }
    }
  }

  return instances;
}

export async function fetchEventInstances(range: DateRange): Promise<EventInstance[]> {
  const events = await fetchEvents(range);
  return expandForRange(events, range);
}

export async function triggerSync(): Promise<SyncResult[]> {
  const { data, error } = await supabase.functions.invoke<SyncRunResponse>('sync-run', { body: {} });
  if (error || !data) {
    throw new Error(`Sync failed: ${error?.message ?? 'no response'}`);
  }
  return data.results;
}

async function invokeEventCrud(request: EventCrudRequest): Promise<SchedEvent | null> {
  const { data, error } = await supabase.functions.invoke<EventCrudResponse>('event-crud', {
    body: request,
  });
  if (error || !data) {
    throw new Error(`event-crud (${request.action}) failed: ${error?.message ?? 'no response'}`);
  }
  return data.schedEvent;
}

export async function createEvent(input: NewEventInput): Promise<SchedEvent> {
  const schedEvent = await invokeEventCrud({ action: 'create', input });
  if (!schedEvent) throw new Error('event-crud create returned no event');
  return schedEvent;
}

export async function updateEvent(
  schedEventId: string,
  input: Partial<NewEventInput>,
): Promise<SchedEvent> {
  const schedEvent = await invokeEventCrud({ action: 'update', schedEventId, input });
  if (!schedEvent) throw new Error('event-crud update returned no event');
  return schedEvent;
}

export async function createOverride(
  masterId: string,
  occurrenceStartTs: string,
  input: NewEventInput,
): Promise<SchedEvent> {
  const schedEvent = await invokeEventCrud({ action: 'createOverride', masterId, occurrenceStartTs, input });
  if (!schedEvent) throw new Error('event-crud createOverride returned no event');
  return schedEvent;
}

export async function editFutureEvents(
  masterId: string,
  occurrenceStartTs: string,
  input: NewEventInput,
): Promise<SchedEvent> {
  const schedEvent = await invokeEventCrud({ action: 'editFuture', masterId, occurrenceStartTs, input });
  if (!schedEvent) throw new Error('event-crud editFuture returned no event');
  return schedEvent;
}

export async function deleteEvent(
  schedEventId: string,
  deleteScope: DeleteScope,
  occurrenceStartTs?: string,
): Promise<void> {
  await invokeEventCrud({ action: 'delete', schedEventId, deleteScope, occurrenceStartTs });
}

export async function pushEvent(schedEventId: string): Promise<SchedEvent> {
  const schedEvent = await invokeEventCrud({ action: 'push', schedEventId });
  if (!schedEvent) throw new Error('event-crud push returned no event');
  return schedEvent;
}

export async function unpushEvent(schedEventId: string): Promise<SchedEvent> {
  const schedEvent = await invokeEventCrud({ action: 'unpush', schedEventId });
  if (!schedEvent) throw new Error('event-crud unpush returned no event');
  return schedEvent;
}

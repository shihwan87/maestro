// Purpose: local-first task migration + freestanding/task-linked event
// CRUD + Google push/un-push (Design Lock #14). Backs task-export/index.ts
// and event-crud/index.ts.
// Inputs/outputs: see interface_contract.md module 6 for the full function
// list. Two functions gained an explicit `userId` parameter beyond the
// original contract text — see NOTES_phase4.md "Signature deviation" and
// the note inline below.
// Architecture note: every write here uses the service-role admin client
// (Edge Functions bypass RLS by design, same pattern as google-auth.ts/
// sync-run), so callers are responsible for supplying the correct userId —
// this module never infers "who is calling."

import { createClient } from 'npm:@supabase/supabase-js@2';
import { insertEvent, patchEvent, deleteEvent } from './calendar-client.ts';
import { getValidAccessToken } from './google-auth.ts';
import type {
  Category,
  DeleteScope,
  GoogleEventBody,
  NewEventInput,
  SchedEvent,
  TaskExportSource,
} from './types.ts';
import { GoogleAuthError } from './types.ts';

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export function resolveExportCalendar(scope: 'work' | 'personal'): string {
  const envKey = scope === 'work' ? 'WORK_CAL_ID' : 'PERSONAL_CAL_ID';
  const calendarId = Deno.env.get(envKey);
  if (!calendarId) throw new Error(`${envKey} not set`);
  return calendarId;
}

function resolveCategoryFromScope(scope: 'work' | 'personal'): Category {
  return scope;
}

// This app's one user is always in Korea (matches the 06:00/14:00/22:00 KST
// cron schedule assumed throughout the project) — hardcoded rather than
// read from the Deno runtime's own local timezone, which is NOT KST
// (Supabase Edge Functions run in UTC) and would silently miscompute every
// date below if relied on. See NOTES_phase4.md bugfix note.
const APP_TZ_OFFSET = '+09:00';
const APP_TZ_OFFSET_MS = 9 * 60 * 60 * 1000;

// Our own inclusive-end convention for all-day rows (distinct from Google's
// exclusive-end all-day convention, applied only at the Google API boundary
// in toGoogleEventBody below): a same-day all-day event has start_ts at
// 00:00:00 and end_ts at 23:59:59 on the *same* calendar date **in KST**,
// so a plain date-range "does this cover day X" check never leaks into the
// next day. The explicit +09:00 offset (rather than a bare, zone-less
// string) is required — without it, Postgres stores the literal as if it
// were UTC, shifting the instant by 9 hours and corrupting which KST
// calendar day it falls on.
function allDayRange(date: string): { start_ts: string; end_ts: string } {
  return { start_ts: `${date}T00:00:00${APP_TZ_OFFSET}`, end_ts: `${date}T23:59:59${APP_TZ_OFFSET}` };
}

function addDays(dateStr: string, n: number): string {
  const shiftedInstantMs = new Date(`${dateStr}T00:00:00${APP_TZ_OFFSET}`).getTime() + n * 24 * 60 * 60 * 1000;
  // Read back via the same KST-shift-then-read-UTC-parts trick as
  // localDateStr below — reading getUTCDate() directly here would give the
  // *UTC* calendar day of a KST midnight instant, which is the day before
  // (Korea has no DST, so this millisecond-based shift is exact).
  const kst = new Date(shiftedInstantMs + APP_TZ_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

// Given a real UTC instant (as stored in the DB), returns the KST calendar
// date it falls on. Shifts by the KST offset first, then reads the date
// parts with the UTC getters — this avoids depending on the Deno runtime's
// own local timezone (which is not KST) the way `new Date(iso).getDate()`
// would.
function localDateStr(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + APP_TZ_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')}`;
}

function toGoogleEventBody(event: Pick<SchedEvent, 'title' | 'description' | 'start_ts' | 'end_ts' | 'all_day' | 'task_id' | 'category'>): GoogleEventBody {
  const body: GoogleEventBody = {
    summary: event.title,
    description: event.description ?? undefined,
    start: event.all_day
      ? { date: localDateStr(event.start_ts) }
      : { dateTime: event.start_ts },
    end: event.all_day
      ? { date: addDays(localDateStr(event.end_ts), 1) } // Google's all-day end is exclusive
      : { dateTime: event.end_ts },
    extendedProperties: {
      private: {
        source: 'schedule_app',
        category: event.category,
        ...(event.task_id ? { task_id: event.task_id } : {}),
      },
    },
  };
  return body;
}

async function getSchedEvent(schedEventId: string): Promise<SchedEvent> {
  const { data, error } = await adminClient()
    .from('sched_events')
    .select('*')
    .eq('id', schedEventId)
    .maybeSingle();
  if (error) throw new Error(`exporter: failed to load sched_events row: ${error.message}`);
  if (!data) throw new Error(`exporter: sched_events row ${schedEventId} not found`);
  return data as SchedEvent;
}

export async function syncStepGcalId(stepId: string, googleEventId: string | null): Promise<void> {
  const { error } = await adminClient().from('steps').update({ gcal_event_id: googleEventId }).eq('id', stepId);
  if (error) throw new Error(`exporter.syncStepGcalId failed: ${error.message}`);
}

// NOTE — signature deviation from interface_contract.md: added `userId`.
// The contract's original signature was `(step: TaskExportSource) =>
// Promise<SchedEvent>`, with no way to know which Supabase Auth user the
// new sched_events row belongs to. task-export/index.ts (the only caller)
// resolves userId itself — see that file's own note on why (single-user
// shortcut, no per-caller login from schemanager). Flagged in
// NOTES_phase4.md, same pattern as Phase 2's logSyncRun deviation.
export async function migrateStepToLocalEvent(step: TaskExportSource, userId: string): Promise<SchedEvent> {
  const existing = await adminClient()
    .from('sched_events')
    .select('*')
    .eq('task_id', step.stepId)
    .maybeSingle();
  if (existing.error) throw new Error(`exporter.migrateStepToLocalEvent read failed: ${existing.error.message}`);
  if (existing.data) return existing.data as SchedEvent;

  if (!step.stepDeadline) {
    throw new Error('exporter.migrateStepToLocalEvent: step has no deadline to migrate onto the calendar');
  }

  const range = allDayRange(step.stepDeadline);
  const row = {
    user_id: userId,
    google_event_id: null,
    calendar_id: null,
    category: resolveCategoryFromScope(step.projectScope),
    source: 'app' as const,
    title: step.stepTitle,
    description: null,
    start_ts: range.start_ts,
    end_ts: range.end_ts,
    all_day: true,
    rrule: null,
    task_id: step.stepId,
    last_synced_title: step.stepTitle,
    last_synced_date: step.stepDeadline,
    color_override: null,
  };
  const { data, error } = await adminClient().from('sched_events').insert(row).select('*').single();
  if (error) throw new Error(`exporter.migrateStepToLocalEvent insert failed: ${error.message}`);
  return data as SchedEvent;
}

export async function pushEventToGoogle(schedEventId: string, accessToken: string): Promise<SchedEvent> {
  const event = await getSchedEvent(schedEventId);
  if (event.google_event_id) return event; // already pushed, no-op

  if (event.category === 'holiday') {
    throw new Error('exporter.pushEventToGoogle: holiday-category events cannot be pushed');
  }

  const calendarId = resolveExportCalendar(event.category);
  const created = await insertEvent(calendarId, accessToken, toGoogleEventBody(event));

  const { data, error } = await adminClient()
    .from('sched_events')
    .update({ google_event_id: created.id, calendar_id: calendarId, synced_at: new Date().toISOString() })
    .eq('id', schedEventId)
    .select('*')
    .single();
  if (error) throw new Error(`exporter.pushEventToGoogle update failed: ${error.message}`);

  if (event.task_id) await syncStepGcalId(event.task_id, created.id);

  return data as SchedEvent;
}

export async function unpushEventFromGoogle(schedEventId: string, accessToken: string): Promise<SchedEvent> {
  const event = await getSchedEvent(schedEventId);
  if (!event.google_event_id) return event; // not pushed, no-op

  await deleteEvent(event.calendar_id!, event.google_event_id, accessToken, 'all');

  const { data, error } = await adminClient()
    .from('sched_events')
    .update({ google_event_id: null, calendar_id: null, synced_at: null })
    .eq('id', schedEventId)
    .select('*')
    .single();
  if (error) throw new Error(`exporter.unpushEventFromGoogle update failed: ${error.message}`);

  if (event.task_id) await syncStepGcalId(event.task_id, null);

  return data as SchedEvent;
}

export async function patchTaskLinkedEvent(
  schedEventId: string,
  fields: { title?: string; date?: string }, // date = 'YYYY-MM-DD', local calendar TZ
): Promise<SchedEvent> {
  const event = await getSchedEvent(schedEventId);

  const titleChanged = fields.title !== undefined && fields.title !== event.last_synced_title;
  const dateChanged = fields.date !== undefined && fields.date !== event.last_synced_date;
  if (!titleChanged && !dateChanged) return event; // idempotency guard (J10)

  const patch: Partial<SchedEvent> = {};
  if (titleChanged) patch.title = fields.title;
  if (dateChanged) {
    const range = allDayRange(fields.date!);
    patch.start_ts = range.start_ts;
    patch.end_ts = range.end_ts;
  }
  patch.last_synced_title = titleChanged ? fields.title! : event.last_synced_title;
  patch.last_synced_date = dateChanged ? fields.date! : event.last_synced_date;

  const { data, error } = await adminClient()
    .from('sched_events')
    .update(patch)
    .eq('id', schedEventId)
    .select('*')
    .single();
  if (error) throw new Error(`exporter.patchTaskLinkedEvent update failed: ${error.message}`);
  const updated = data as SchedEvent;

  if (updated.google_event_id) {
    const accessToken = await getValidAccessToken(updated.user_id);
    const body: Partial<GoogleEventBody> = {};
    if (titleChanged) body.summary = updated.title;
    if (dateChanged) {
      body.start = { date: localDateStr(updated.start_ts) };
      body.end = { date: addDays(localDateStr(updated.end_ts), 1) };
    }
    await patchEvent(updated.calendar_id!, updated.google_event_id, accessToken, body);
  }

  return updated;
}

// NOTE — signature deviation from interface_contract.md: added `userId`,
// used only on the create branch (a brand-new row needs an owner; update
// reads user_id off the existing row instead). event-crud/index.ts (the
// only caller) resolves userId from the caller's Supabase Auth JWT — see
// that file. Same class of deviation as migrateStepToLocalEvent above.
export async function createOrUpdateFreestandingEvent(
  input: NewEventInput | (Partial<NewEventInput> & { schedEventId: string }),
  userId: string,
): Promise<SchedEvent> {
  if (!('schedEventId' in input)) {
    // Create — always local-only (Design Lock #14): no Google call, ever.
    const range = input.allDay ? allDayRange(input.startTs) : null;
    const row = {
      user_id: userId,
      google_event_id: null,
      calendar_id: null,
      category: input.category,
      source: 'app' as const,
      title: input.title,
      description: input.description,
      start_ts: range ? range.start_ts : input.startTs,
      end_ts: range ? range.end_ts : input.endTs,
      all_day: input.allDay,
      rrule: input.rrule,
      task_id: null,
      color_override: input.colorOverride,
    };
    const { data, error } = await adminClient().from('sched_events').insert(row).select('*').single();
    if (error) throw new Error(`exporter.createOrUpdateFreestandingEvent insert failed: ${error.message}`);
    return data as SchedEvent;
  }

  // Update.
  const { schedEventId, ...fields } = input;
  const existing = await getSchedEvent(schedEventId);

  const changedKeys = (Object.keys(fields) as Array<keyof typeof fields>).filter((key) => {
    if (key === 'startTs') return fields.startTs !== undefined && fields.startTs !== existing.start_ts;
    if (key === 'endTs') return fields.endTs !== undefined && fields.endTs !== existing.end_ts;
    if (key === 'colorOverride') return fields.colorOverride !== existing.color_override;
    if (key === 'allDay') return fields.allDay !== undefined && fields.allDay !== existing.all_day;
    if (key === 'rrule') return fields.rrule !== undefined && fields.rrule !== existing.rrule;
    if (key === 'title') return fields.title !== undefined && fields.title !== existing.title;
    if (key === 'description') return fields.description !== undefined && fields.description !== existing.description;
    if (key === 'category') return fields.category !== undefined && fields.category !== existing.category;
    return false;
  });
  // J13 — a color-only patch must never touch Google, regardless of push state.
  const isColorOnlyChange = changedKeys.length === 1 && changedKeys[0] === 'colorOverride';

  const patch: Record<string, unknown> = {};
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.category !== undefined) patch.category = fields.category;
  if (fields.allDay !== undefined) patch.all_day = fields.allDay;
  if (fields.rrule !== undefined) patch.rrule = fields.rrule;
  if (fields.colorOverride !== undefined) patch.color_override = fields.colorOverride;
  // Use the *effective* all_day state (incoming value if provided, else
  // the existing row's) — otherwise editing just the date of an existing
  // all-day event, without also re-sending allDay:true, would skip the
  // inclusive-day conversion and store a bare date string as a timestamptz.
  const effectiveAllDay = fields.allDay !== undefined ? fields.allDay : existing.all_day;
  if (effectiveAllDay) {
    if (fields.startTs !== undefined) {
      const range = allDayRange(fields.startTs);
      patch.start_ts = range.start_ts;
      patch.end_ts = range.end_ts;
    }
  } else {
    if (fields.startTs !== undefined) patch.start_ts = fields.startTs;
    if (fields.endTs !== undefined) patch.end_ts = fields.endTs;
  }

  const { data, error } = await adminClient()
    .from('sched_events')
    .update(patch)
    .eq('id', schedEventId)
    .select('*')
    .single();
  if (error) throw new Error(`exporter.createOrUpdateFreestandingEvent update failed: ${error.message}`);
  const updated = data as SchedEvent;

  if (!isColorOnlyChange && updated.google_event_id && changedKeys.length > 0) {
    const accessToken = await getValidAccessToken(updated.user_id);
    await patchEvent(updated.calendar_id!, updated.google_event_id, accessToken, toGoogleEventBody(updated));
  }

  return updated;
}

export async function deleteExportedEvent(
  schedEventId: string,
  accessToken: string | null, // null allowed — only required if the row turns out to be pushed
  scope: DeleteScope,
): Promise<void> {
  const event = await getSchedEvent(schedEventId);

  if (event.google_event_id) {
    if (!accessToken) {
      throw new GoogleAuthError('deleteExportedEvent: event is pushed to Google, an access token is required');
    }
    // occurrenceStartTs only matters for scope='future'/'this' on a
    // recurring event — nothing creates recurring app events yet (arrives
    // Phase 6), so this always resolves to the master's own start_ts today.
    await deleteEvent(event.calendar_id!, event.google_event_id, accessToken, scope, event.start_ts);
  }

  if (event.task_id && scope === 'all') {
    await syncStepGcalId(event.task_id, null);
  }

  const { error } = await adminClient().from('sched_events').delete().eq('id', schedEventId);
  if (error) throw new Error(`exporter.deleteExportedEvent delete failed: ${error.message}`);
}

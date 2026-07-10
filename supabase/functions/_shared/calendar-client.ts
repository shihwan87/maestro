// Purpose: thin wrapper around the Google Calendar v3 REST API.
// Inputs: a calendarId, a valid Google access token (from google-auth.ts),
// and (for listEvents) an optional stored syncToken for incremental sync.
// Outputs: typed Google Calendar Event resources (subset, see types.ts).
// Architecture note: this module only speaks to the Google REST API, never
// to Supabase — retry/fallback decisions (e.g. what to do on a 410 Gone)
// are made by the caller (importer.ts/exporter.ts), so this stays a small,
// testable API client with no business logic of its own. insertEvent/
// patchEvent/deleteEvent (added Phase 4) back exporter.ts's push/un-push/
// delete actions.

import type { GoogleCalendarEvent, CalendarListResult, GoogleEventBody, DeleteScope } from './types.ts';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

// A calendar with years of history returns thousands of events on its first
// (non-incremental) sync — slow, and floods sched_events with old,
// irrelevant events. Bound the *initial* full sync to recent history only;
// per Google's documented sync-token behavior, an incremental sync started
// from a time-bounded full sync stays scoped to that same window going
// forward (timeMin/timeMax can't be combined with syncToken at all, so this
// only applies on the no-syncToken branch below).
const FULL_SYNC_LOOKBACK_DAYS = 30;

function eventsUrl(calendarId: string): string {
  return `${CALENDAR_API_BASE}/${encodeURIComponent(calendarId)}/events`;
}

export async function listEvents(
  calendarId: string,
  accessToken: string,
  syncToken?: string,
): Promise<CalendarListResult> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  for (;;) {
    const params = new URLSearchParams({
      // showDeleted=true is required so incremental (syncToken) sync gets
      // told about events removed since the last run, not just added/
      // changed ones — without it, deletions would never reach sched_events.
      showDeleted: 'true',
      maxResults: '2500',
    });
    if (syncToken) {
      params.set('syncToken', syncToken);
    } else {
      const lookback = new Date(Date.now() - FULL_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      params.set('timeMin', lookback.toISOString());
    }
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${eventsUrl(calendarId)}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 410) {
      // Stored syncToken is gone/invalid — caller must retry with no
      // syncToken at all (a fresh full sync), per Google's documented
      // incremental-sync contract.
      return { events: [], nextSyncToken: null, fullSyncRequired: true };
    }
    if (!res.ok) {
      throw new Error(`calendar-client.listEvents failed: ${res.status} ${await res.text()}`);
    }

    const body = await res.json();
    events.push(...(body.items ?? []));

    if (!body.nextPageToken) {
      // Google only returns nextSyncToken on the final page of a listing.
      return { events, nextSyncToken: body.nextSyncToken ?? null, fullSyncRequired: false };
    }
    pageToken = body.nextPageToken;
  }
}

async function requestJson(
  url: string,
  method: string,
  accessToken: string,
  body?: unknown,
): Promise<GoogleCalendarEvent> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`calendar-client.${method} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function insertEvent(
  calendarId: string,
  accessToken: string,
  body: GoogleEventBody,
): Promise<GoogleCalendarEvent> {
  return requestJson(eventsUrl(calendarId), 'POST', accessToken, body);
}

export async function patchEvent(
  calendarId: string,
  eventId: string,
  accessToken: string,
  body: Partial<GoogleEventBody>,
): Promise<GoogleCalendarEvent> {
  const url = `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`;
  return requestJson(url, 'PATCH', accessToken, body);
}

export async function deleteEvent(
  calendarId: string,
  eventId: string,
  accessToken: string,
  scope: DeleteScope,
  occurrenceStartTs?: string, // required when scope === 'this'
): Promise<void> {
  const base = eventsUrl(calendarId);

  if (scope === 'all') {
    const res = await fetch(`${base}/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 410 && res.status !== 404) {
      throw new Error(`calendar-client.deleteEvent(all) failed: ${res.status} ${await res.text()}`);
    }
    return;
  }

  if (scope === 'this') {
    // A single instance of a recurring event is its own Google event id
    // (the occurrence id), so 'this' is the same outright delete as 'all'.
    const res = await fetch(`${base}/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 410 && res.status !== 404) {
      throw new Error(`calendar-client.deleteEvent(this) failed: ${res.status} ${await res.text()}`);
    }
    return;
  }

  // scope === 'future': truncate the master's RRULE with an UNTIL one
  // second before this occurrence, rather than deleting the master.
  if (!occurrenceStartTs) {
    throw new Error("calendar-client.deleteEvent(scope='future') requires occurrenceStartTs");
  }
  const untilDate = new Date(new Date(occurrenceStartTs).getTime() - 1000);
  const until = untilDate.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const current = await requestJson(`${base}/${encodeURIComponent(eventId)}`, 'GET', accessToken);
  const currentRule = (current.recurrence ?? []).find((r) => r.startsWith('RRULE'));
  if (!currentRule) {
    throw new Error("calendar-client.deleteEvent(scope='future'): master event has no RRULE");
  }
  const truncatedRule = `${currentRule.replace(/;?UNTIL=[^;]*/, '')};UNTIL=${until}`;
  await patchEvent(calendarId, eventId, accessToken, { recurrence: [truncatedRule] });
}

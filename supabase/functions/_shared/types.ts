// Purpose: shared TypeScript types for every schedule_manager backend
// (Deno Edge Function) module. Nothing here has logic — types only.
// Inputs/outputs: none (type-only module).
// Architecture note: every other backend module imports types from this
// file instead of redefining them locally, so the whole backend agrees on
// one shape per concept (see interface_contract.md module 2). The frontend
// keeps its own mirror at src/lib/types.ts (J2) because Deno modules can't
// be imported into a Vite/browser bundle directly — keep the two in sync
// by hand when either changes.

// ---- Enums / literal unions ----

export type Category = 'work' | 'personal' | 'holiday';
export type EventSource = 'app' | 'imported' | 'holiday';
export type DeleteScope = 'this' | 'future' | 'all';
export type RecurrencePreset =
  | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom';

// ---- DB row mirrors (snake_case, exact column match) ----

export interface SchedEvent {
  id: string;
  user_id: string;
  google_event_id: string | null; // NULL = local-only, the default (Design Lock #14)
  calendar_id: string | null;     // NULL until pushed/imported
  category: Category;
  source: EventSource;
  title: string;
  description: string | null;
  start_ts: string;               // ISO timestamptz
  end_ts: string;
  all_day: boolean;
  rrule: string | null;           // RFC 5545 RRULE, master row only
  recurrence_parent_id: string | null;
  override_of_event_id: string | null;
  override_start_ts: string | null;
  task_id: string | null;         // references steps.id (NOT a "tasks" table)
  last_synced_title: string | null; // last known-good title shared with linked step (J10 idempotency guard)
  last_synced_date: string | null;  // last known-good date shared with linked step, 'YYYY-MM-DD' (J10 idempotency guard)
  color_override: string | null;  // local-display-only; NEVER read/written to Google's colorId
  extended_props: Record<string, unknown> | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GoogleAuthRow { // mirrors sched_google_auth
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  updated_at: string;
}

export interface SchedSyncStateRow { // mirrors sched_sync_state
  user_id: string;
  calendar_id: string;
  sync_token: string | null;
  last_polled_at: string | null;
}

export interface SchedReportRow { // mirrors sched_reports
  id: string;
  user_id: string;
  iso_week: string;               // 'YYYY-Www'
  generated_at: string;
  pdf_local_path: string | null;
  drive_file_id: string | null;
  summary_json: WeeklyReportData;
}

// ---- Computed / in-memory types ----

export interface EventInstance {
  sourceEvent: SchedEvent;
  instanceStartTs: string;
  instanceEndTs: string;
  isOverride: boolean;
  isRecurring: boolean;
}

export interface SyncResult {
  calendarId: string;
  category: Category;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  error: string | null;
  ranAt: string;
}

export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken: string | null;    // null on refresh-only responses
  expiresAt: string;
}

export interface GoogleCalendarEvent { // subset of Google Calendar API Event resource
  id: string;
  status: string;
  summary?: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
  updated?: string;
}

export interface GoogleEventBody { // request body subset for insert/patch
  summary: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  extendedProperties?: { private: Record<string, string> };
}

export interface CalendarListResult {
  events: GoogleCalendarEvent[];
  nextSyncToken: string | null;
  fullSyncRequired: boolean;      // true on Google 410 Gone
}

export interface RecurrenceOptions {
  preset: RecurrencePreset;
  interval: number;
  byDay: string[] | null;         // e.g. ['MO','WE','FR'], custom preset only
  until: string | null;           // ISO date; mutually exclusive with count
  count: number | null;
  rruleString: string;            // canonical derived RFC 5545 RRULE
}

export interface TaskExportSource { // steps + projects join, export unit
  stepId: string;                   // steps.id
  stepTitle: string;                // steps.title
  stepDeadline: string | null;      // steps.deadline
  stepStatus: string;               // steps.status
  existingGcalEventId: string | null; // steps.gcal_event_id
  projectId: string;                // projects.id
  projectTitle: string;             // projects.title
  projectScope: 'work' | 'personal'; // projects.scope — drives calendar routing
  projectCategory: string;          // projects.category — label only, NOT routing
}

export interface TaskExportRequest { // task-export/index.ts request body — migrate/un-migrate, local-first
  stepId: string;
  enabled: boolean;                 // true = migrate (local only), false = un-migrate (removes local + Google if pushed)
  deleteScope?: DeleteScope;
}

export interface TaskExportResponse { // task-export/index.ts response body
  schedEvent: SchedEvent | null;    // null when enabled=false (removed)
}

// ---- session 2 addendum types ----

export interface NewEventInput { // freestanding (non-task) event create/update payload
  title: string;
  description: string | null;
  category: 'work' | 'personal';  // holiday not creatable by users
  startTs: string;                // ISO timestamptz (date-only string if allDay)
  endTs: string;
  allDay: boolean;
  rrule: string | null;           // from RecurrenceEditor's RecurrenceOptions.rruleString
  colorOverride: string | null;   // local-display-only, see SchedEvent.color_override
}

export type EventCrudRequest = // event-crud/index.ts request body, discriminated union
  | { action: 'create'; input: NewEventInput }
  | { action: 'update'; schedEventId: string; input: Partial<NewEventInput> }
  | { action: 'delete'; schedEventId: string; deleteScope: DeleteScope; occurrenceStartTs?: string }
  | { action: 'push'; schedEventId: string }
  | { action: 'unpush'; schedEventId: string }
  | { action: 'createOverride'; masterId: string; occurrenceStartTs: string; input: NewEventInput }
  | { action: 'editFuture'; masterId: string; occurrenceStartTs: string; input: NewEventInput };

export interface EventCrudResponse { // event-crud/index.ts response body
  schedEvent: SchedEvent | null;    // null on successful delete
}

export interface DayLayout { // src/lib/layout.ts output for one day
  allDayRow: EventInstance[];
  timedByHour: Record<number, EventInstance[]>; // 0-23
}

export interface WeekLayout { // src/lib/layout.ts output for one week
  allDayBars: Array<{ instance: EventInstance; startCol: number; endCol: number }>; // 0-6, inclusive
  timedByDay: Record<string, EventInstance[]>; // keyed by 'YYYY-MM-DD'
}

export interface DriveUploadResult {
  driveFileId: string;
  webViewLink: string;
}

export interface TaskCompletionStats {
  totalSteps: number;
  doneSteps: number;
  completionRate: number;         // 0-1
}

export interface MissedEventSummary {
  eventId: string;
  title: string;
  reason: 'rescheduled' | 'missed_deadline';
  originalStartTs: string | null;
  detectedAt: string;
}

export interface WeeklyReportData {
  userId: string;
  isoWeek: string;                // 'YYYY-Www'
  weekStart: string;               // date
  weekEnd: string;
  categoryHours: { work: number; personal: number }; // holidays excluded
  taskCompletion: TaskCompletionStats;
  missedOrRescheduled: MissedEventSummary[];
  narrative: string | null;       // optional Claude API summary — null in v1, see J5
}

export interface DateRange {
  start: string;                  // ISO date or timestamptz, inclusive
  end: string;                    // exclusive
}

// ---- Edge Function request/response wrappers ----

export interface SyncRunRequest { calendarIds?: string[] }
export interface SyncRunResponse { results: SyncResult[] }
export interface ReportGenerateResponse { report: SchedReportRow }
export interface GoogleOAuthStartResponse { authUrl: string } // google-oauth-callback leg 1 response

// ---- Errors ----

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

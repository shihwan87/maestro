// Purpose: frontend mirror of schemanager/supabase/functions/_shared/types.ts.
// Inputs/outputs: none — type-only module.
// Architecture note: a Deno Edge Function module can't be imported into a
// Vite/browser bundle, so this is a manually-kept-in-sync duplicate (J2 in
// interface_contract.md), not a shared import. Raw Google Calendar API
// wire-shape types (GoogleCalendarEvent, GoogleEventBody, etc.) are
// intentionally omitted — the frontend never talks to Google directly, only
// to this app's own Edge Functions, which already return SchedEvent shapes.

export type Category = 'work' | 'personal' | 'holiday';
export type EventSource = 'app' | 'imported' | 'holiday';
export type DeleteScope = 'this' | 'future' | 'all';
export type RecurrencePreset =
  | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom';

export interface SchedEvent {
  id: string;
  user_id: string;
  google_event_id: string | null;
  calendar_id: string | null;
  category: Category;
  source: EventSource;
  title: string;
  description: string | null;
  start_ts: string;
  end_ts: string;
  all_day: boolean;
  rrule: string | null;
  recurrence_parent_id: string | null;
  override_of_event_id: string | null;
  override_start_ts: string | null;
  task_id: string | null;
  last_synced_title: string | null;
  last_synced_date: string | null;
  color_override: string | null;
  extended_props: Record<string, unknown> | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchedReportRow {
  id: string;
  user_id: string;
  iso_week: string;
  generated_at: string;
  pdf_local_path: string | null;
  drive_file_id: string | null;
  summary_json: WeeklyReportData;
}

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

export interface RecurrenceOptions {
  preset: RecurrencePreset;
  interval: number;
  byDay: string[] | null;
  until: string | null;
  count: number | null;
  rruleString: string;
}

export interface TaskExportSource {
  stepId: string;
  stepTitle: string;
  stepDeadline: string | null;
  stepStatus: string;
  existingGcalEventId: string | null;
  projectId: string;
  projectTitle: string;
  projectScope: 'work' | 'personal';
  projectCategory: string;
}

export interface TaskExportRequest {
  stepId: string;
  enabled: boolean;
  deleteScope?: DeleteScope;
}

export interface TaskExportResponse {
  schedEvent: SchedEvent | null;
}

export interface NewEventInput {
  title: string;
  description: string | null;
  category: 'work' | 'personal';
  startTs: string;
  endTs: string;
  allDay: boolean;
  rrule: string | null;
  colorOverride: string | null;
}

export type EventCrudRequest =
  | { action: 'create'; input: NewEventInput }
  | { action: 'update'; schedEventId: string; input: Partial<NewEventInput> }
  | { action: 'delete'; schedEventId: string; deleteScope: DeleteScope; occurrenceStartTs?: string }
  | { action: 'push'; schedEventId: string }
  | { action: 'unpush'; schedEventId: string }
  | { action: 'createOverride'; masterId: string; occurrenceStartTs: string; input: NewEventInput }
  | { action: 'editFuture'; masterId: string; occurrenceStartTs: string; input: NewEventInput };

export interface EventCrudResponse {
  schedEvent: SchedEvent | null;
}

export interface DayLayout {
  allDayRow: EventInstance[];
  timedByHour: Record<number, EventInstance[]>;
}

export interface WeekLayout {
  allDayBars: Array<{ instance: EventInstance; startCol: number; endCol: number }>;
  timedByDay: Record<string, EventInstance[]>;
}

export interface TaskCompletionStats {
  totalSteps: number;
  doneSteps: number;
  completionRate: number;
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
  isoWeek: string;
  weekStart: string;
  weekEnd: string;
  categoryHours: { work: number; personal: number };
  taskCompletion: TaskCompletionStats;
  missedOrRescheduled: MissedEventSummary[];
  narrative: string | null;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface SyncRunRequest { calendarIds?: string[] }
export interface SyncRunResponse { results: SyncResult[] }
export interface ReportGenerateResponse { report: SchedReportRow }
export interface GoogleOAuthStartResponse { authUrl: string }

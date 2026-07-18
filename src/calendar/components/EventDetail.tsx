// Purpose: modal showing one event's detail, or a blank creation form.
// Inputs: EventDetailProps (interface_contract.md module 25).
// Outputs: calls onSaved after a create/update, onDeleted after a delete,
// onClose always.
// Architecture note (Phase 4 scope decision): full edit is only offered for
// freestanding events (task_id === null). A task-linked event's title/date
// are meant to stay in sync with its schemanager step (Design Lock #10),
// but that sync machinery (task-sync-webhook, patchTaskLinkedEvent) only
// covers step -> event; editing the event directly here has no matching
// event -> step write-back yet. Rather than half-build a second sync path
// that could race the webhook, task-linked events stay view-only for
// title/date (edit the step in schemanager instead) — delete and push/
// unpush still work, since deleting a task-linked event is exactly the
// same operation as un-migrating it. See NOTES_phase4.md.

import { useEffect, useState } from 'react';
import type { DeleteScope, EventInstance, NewEventInput, SchedEvent } from '../lib/types';
import { createEvent, createOverride, deleteEvent, editFutureEvents, pushEvent, unpushEvent, updateEvent } from '../lib/api';
import { CATEGORY_COLOR, COLORS, PALETTE } from '../../styles/theme';
import { RecurrenceEditor } from './RecurrenceEditor';

export type EventDetailMode = 'closed' | 'view' | 'edit' | 'create';

interface EventDetailProps {
  mode: EventDetailMode;
  instance?: EventInstance | null;
  createDefaults?: { date: string; allDay: boolean; startHour?: number; endHour?: number } | null;
  onClose: () => void;
  onSaved?: (updated: SchedEvent) => void;
  onDeleted?: (schedEventId: string) => void;
  // Addition beyond interface_contract.md's listed props: App.tsx owns
  // mode transitions (per module 28), so the "Edit" button here just asks
  // the parent to switch its own state from 'view' to 'edit' for the same
  // instance, rather than toggling an internal, mode-shadowing boolean.
  onEdit?: () => void;
}

const SOURCE_LABEL: Record<SchedEvent['source'], string> = {
  app: 'Added in this app',
  imported: 'Imported from Google Calendar',
  holiday: 'Holiday',
};

function localDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localTimeStr(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatRange(instance: EventInstance): string {
  const start = new Date(instance.instanceStartTs);
  const end = new Date(instance.instanceEndTs);
  if (instance.sourceEvent.all_day) {
    return start.toLocaleDateString();
  }
  const dateStr = start.toLocaleDateString();
  const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} · ${startTime} – ${endTime}`;
}

interface FormState {
  title: string;
  description: string;
  category: 'work' | 'personal';
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  colorOverride: string | null;
  rrule: string | null;
}

function formFromInstance(instance: EventInstance, editThisOnly?: boolean): FormState {
  const event = instance.sourceEvent;
  // "Edit all": show the master event's start/end (the rule's anchor).
  // "Edit this only": show the clicked occurrence's date/time, no rrule.
  const useOccurrence = editThisOnly || !event.rrule;
  const startSrc = useOccurrence ? instance.instanceStartTs : event.start_ts;
  const endSrc = useOccurrence ? instance.instanceEndTs : event.end_ts;
  return {
    title: event.title,
    description: event.description ?? '',
    category: event.category === 'holiday' ? 'work' : event.category,
    date: localDateStr(startSrc),
    allDay: event.all_day,
    startTime: event.all_day ? '09:00' : localTimeStr(startSrc),
    endTime: event.all_day ? '10:00' : localTimeStr(endSrc),
    colorOverride: event.color_override,
    rrule: editThisOnly ? null : event.rrule,
  };
}

function formFromDefaults(defaults: { date: string; allDay: boolean; startHour?: number; endHour?: number }): FormState {
  const sh = defaults.startHour ?? 9;
  const eh = defaults.endHour ?? Math.min(sh + 1, 23);
  return {
    title: '',
    description: '',
    category: 'work',
    date: defaults.date,
    allDay: defaults.allDay,
    startTime: `${String(sh).padStart(2, '0')}:00`,
    endTime: `${String(eh).padStart(2, '0')}:00`,
    colorOverride: null,
    rrule: null,
  };
}

function buildNewEventInput(form: FormState): NewEventInput {
  // For timed events, convert through the browser's own local timezone via
  // Date/toISOString rather than sending a bare "date+time" string — a
  // naive string with no offset gets stored by Postgres as if it were UTC,
  // shifting every timed event by the local UTC offset (this was the
  // "2pm shows as 11pm" bug). All-day events pass a bare date on purpose —
  // the backend (exporter.ts) converts those explicitly in the app's own
  // timezone, see allDayRange there.
  const startTs = form.allDay ? form.date : new Date(`${form.date}T${form.startTime}:00`).toISOString();
  const endTs = form.allDay ? form.date : new Date(`${form.date}T${form.endTime}:00`).toISOString();
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    category: form.category,
    startTs,
    endTs,
    allDay: form.allDay,
    rrule: form.rrule,
    colorOverride: form.colorOverride,
  };
}

export function EventDetail({ mode, instance, createDefaults, onClose, onSaved, onDeleted, onEdit }: EventDetailProps) {
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editScope, setEditScope] = useState<'all' | 'this' | 'future'>('all');
  const [showEditScope, setShowEditScope] = useState(false);
  const [showDeleteScope, setShowDeleteScope] = useState(false);

  useEffect(() => {
    setError(null);
    setBusy(false);
    if (mode === 'edit') return;
    setEditScope('all');
    setShowEditScope(false);
    setShowDeleteScope(false);
    if (mode === 'create' && createDefaults) {
      setForm(formFromDefaults(createDefaults));
    } else if (mode === 'view' && instance) {
      setForm(formFromInstance(instance, false));
    } else {
      setForm(null);
    }
  }, [mode, instance, createDefaults]);

  if (mode === 'closed') return null;
  if ((mode === 'view' || mode === 'edit') && !instance) return null;
  if (mode === 'create' && !createDefaults) return null;
  if (!form) return null;

  const event = instance?.sourceEvent ?? null;
  const isFreestandingApp = event?.source === 'app' && !event.task_id;
  const isTaskLinkedApp = event?.source === 'app' && !!event.task_id;
  const color = form.colorOverride ?? (event ? CATEGORY_COLOR[event.category] : CATEGORY_COLOR[form.category]);

  async function handleSaveCreate() {
    if (!form!.title.trim()) {
      setError('Title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createEvent(buildNewEventInput(form!));
      onSaved?.(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit() {
    if (!event || !instance) return;
    if (!form!.title.trim()) {
      setError('Title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let updated: SchedEvent;
      if (editScope === 'this' && instance.isRecurring) {
        updated = await createOverride(event.id, instance.instanceStartTs, buildNewEventInput(form!));
      } else if (editScope === 'future' && instance.isRecurring) {
        updated = await editFutureEvents(event.id, instance.instanceStartTs, buildNewEventInput(form!));
      } else {
        updated = await updateEvent(event.id, buildNewEventInput(form!));
      }
      onSaved?.(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setBusy(false);
    }
  }

  async function handleColorOnlyChange(nextColor: string | null) {
    if (!event) return;
    setForm((f) => (f ? { ...f, colorOverride: nextColor } : f));
    setBusy(true);
    setError(null);
    try {
      const updated = await updateEvent(event.id, { colorOverride: nextColor });
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update color');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(deleteScope: DeleteScope) {
    if (!event || !instance) return;
    setBusy(true);
    setError(null);
    setShowDeleteScope(false);
    try {
      const occurrenceStartTs = deleteScope !== 'all' ? instance.instanceStartTs : undefined;
      await deleteEvent(event.id, deleteScope, occurrenceStartTs);
      onDeleted?.(event.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete event');
      setBusy(false);
    }
  }

  function initiateDelete() {
    if (!event) return;
    if (instance?.isRecurring) {
      setShowDeleteScope(true);
    } else {
      if (window.confirm('Delete this event?')) {
        handleDelete('all');
      }
    }
  }

  async function handlePushToggle() {
    if (!event) return;
    setBusy(true);
    setError(null);
    try {
      const updated = event.google_event_id ? await unpushEvent(event.id) : await pushEvent(event.id);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sync failed');
    } finally {
      setBusy(false);
    }
  }

  const showEditForm = mode === 'create' || mode === 'edit';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          padding: 20,
          width: 380,
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflowY: 'auto',
          color: COLORS.text,
        }}
      >
        {showEditForm ? (
          <>
            <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{mode === 'create' ? 'Add event' : 'Edit event'}</h2>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Title"
              style={inputStyle}
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description (optional)"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as 'work' | 'personal' })}
                style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
              >
                <option value="work">Work</option>
                <option value="personal">Personal</option>
              </select>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
              />
              All-day
            </label>
            {!form.allDay && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <TimeInput
                  value={form.startTime}
                  onChange={(v) => setForm({ ...form, startTime: v })}
                />
                <span style={{ color: COLORS.muted }}>–</span>
                <TimeInput
                  value={form.endTime}
                  onChange={(v) => setForm({ ...form, endTime: v })}
                />
              </div>
            )}

            <RecurrenceEditor
              value={form.rrule}
              onChange={(rrule) => setForm({ ...form, rrule })}
            />

            <ColorSwatchPicker value={form.colorOverride} onChange={(c) => setForm({ ...form, colorOverride: c })} />

            {error && <p style={{ color: COLORS.danger, fontSize: 12 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={onClose} disabled={busy} style={secondaryButtonStyle}>
                Cancel
              </button>
              <button
                onClick={mode === 'create' ? handleSaveCreate : handleSaveEdit}
                disabled={busy}
                style={primaryButtonStyle}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        ) : (
          instance &&
          event && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <h2 style={{ fontSize: 16, margin: 0 }}>{event.title}</h2>
              </div>

              <p style={{ color: COLORS.muted, margin: '4px 0' }}>{formatRange(instance)}</p>
              {event.description && <p style={{ margin: '12px 0' }}>{event.description}</p>}

              <p style={{ color: COLORS.muted, fontSize: 13, margin: '12px 0 4px' }}>
                {SOURCE_LABEL[event.source]}
                {event.google_event_id && ' · synced to Google Calendar'}
              </p>

              {isTaskLinkedApp && (
                <p style={{ color: COLORS.muted, fontSize: 13, margin: '4px 0' }}>
                  Title and date are managed from the linked task — edit the step in schemanager. Deleting here
                  removes it from your calendar (un-migrates it).
                </p>
              )}

              {event.source === 'app' && (
                <ColorSwatchPicker value={event.color_override} onChange={handleColorOnlyChange} disabled={busy} />
              )}

              {error && <p style={{ color: COLORS.danger, fontSize: 12 }}>{error}</p>}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                {isFreestandingApp && (
                  <button
                    onClick={() => {
                      if (instance?.isRecurring) {
                        setShowEditScope(true);
                      } else {
                        onEdit?.();
                      }
                    }}
                    disabled={busy}
                    style={secondaryButtonStyle}
                  >
                    Edit
                  </button>
                )}
                {event.source === 'app' && (
                  <button onClick={handlePushToggle} disabled={busy} style={secondaryButtonStyle}>
                    {busy ? 'Working…' : event.google_event_id ? 'Un-push from Google' : 'Push to Google Calendar'}
                  </button>
                )}
                {event.source === 'app' && (
                  <button
                    onClick={initiateDelete}
                    disabled={busy}
                    style={{ ...secondaryButtonStyle, color: COLORS.danger, borderColor: COLORS.danger }}
                  >
                    Delete
                  </button>
                )}
                <button onClick={onClose} style={{ ...secondaryButtonStyle, marginLeft: 'auto' }}>
                  Close
                </button>
              </div>
            </>
          )
        )}

        {showEditScope && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
          }}>
            <div style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: 16,
              width: 280,
            }}>
              <p style={{ fontSize: 14, margin: '0 0 12px' }}>Edit recurring event</p>
              {([
                ['this', 'This event only'],
                ['future', 'This and future events'],
                ['all', 'All events'],
              ] as ['this' | 'future' | 'all', string][]).map(([scope, label]) => (
                <button
                  key={scope}
                  onClick={() => {
                    setShowEditScope(false);
                    setEditScope(scope);
                    if (instance) setForm(formFromInstance(instance, scope === 'this' || scope === 'future'));
                    onEdit?.();
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    marginBottom: 6,
                    background: 'none',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 4,
                    color: COLORS.text,
                    cursor: 'pointer',
                    fontSize: 13,
                    textAlign: 'left',
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowEditScope(false)}
                style={{ ...secondaryButtonStyle, width: '100%', marginTop: 4 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {showDeleteScope && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
          }}>
            <div style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: 16,
              width: 280,
            }}>
              <p style={{ fontSize: 14, margin: '0 0 12px' }}>Delete recurring event</p>
              {([
                ['this', 'This event only'],
                ['future', 'This and future events'],
                ['all', 'All events'],
              ] as [DeleteScope, string][]).map(([scope, label]) => (
                <button
                  key={scope}
                  onClick={() => handleDelete(scope)}
                  disabled={busy}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    marginBottom: 6,
                    background: 'none',
                    border: `1px solid ${scope === 'all' ? COLORS.danger : COLORS.border}`,
                    borderRadius: 4,
                    color: scope === 'all' ? COLORS.danger : COLORS.text,
                    cursor: 'pointer',
                    fontSize: 13,
                    textAlign: 'left',
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowDeleteScope(false)}
                style={{ ...secondaryButtonStyle, width: '100%', marginTop: 4 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Smart time input: single text field that accepts multiple formats.
// Type "1330" or "13:30" → 1:30 PM. Type "230" → 2:30 AM. Type "9" → 9:00 AM.
// AM/PM toggle button flips between halves of the day without retyping.
// Internal format stays "HH:MM" (24h) for form state compatibility.
function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value.split(':');
  const h24 = parseInt(parts[0] ?? '9', 10);
  const min = parseInt(parts[1] ?? '0', 10);
  const isPM = h24 >= 12;
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;

  const displayValue = `${h12}:${String(min).padStart(2, '0')}`;

  const [draft, setDraft] = useState(displayValue);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(displayValue);
  }, [displayValue, focused]);

  function commitHHMM(h: number, m: number) {
    h = Math.max(0, Math.min(23, h));
    m = Math.max(0, Math.min(59, m));
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }

  function parseDraft(raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, '');
    if (!cleaned) return;
    const n = parseInt(cleaned, 10);
    if (isNaN(n)) return;

    if (cleaned.length <= 2) {
      // 1-2 digits: treat as hour, keep current minutes → 0
      commitHHMM(n >= 24 ? Math.min(n, 23) : n, 0);
    } else if (cleaned.length === 3) {
      // 3 digits: first digit = hour, last two = minutes (e.g. "230" → 2:30)
      const hh = parseInt(cleaned[0], 10);
      const mm = parseInt(cleaned.slice(1), 10);
      commitHHMM(hh, mm);
    } else {
      // 4+ digits: first two = hour, next two = minutes (e.g. "1330" → 13:30)
      const hh = parseInt(cleaned.slice(0, 2), 10);
      const mm = parseInt(cleaned.slice(2, 4), 10);
      commitHHMM(hh, mm);
    }
  }

  function toggleAMPM() {
    const toggled = isPM ? h24 - 12 : h24 + 12;
    commitHHMM(toggled, min);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <input
        type="text"
        inputMode="numeric"
        value={focused ? draft : displayValue}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          setDraft(e.target.value);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          parseDraft(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="0:00"
        style={{
          width: 64,
          padding: '6px 4px',
          textAlign: 'center',
          background: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 4,
          color: COLORS.text,
          fontSize: 13,
          boxSizing: 'border-box',
        }}
      />
      <button
        type="button"
        onClick={toggleAMPM}
        style={{
          padding: '6px 8px',
          background: COLORS.primary,
          border: 'none',
          borderRadius: 4,
          color: '#fff',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          minWidth: 38,
        }}
      >
        {isPM ? 'PM' : 'AM'}
      </button>
    </div>
  );
}

function ColorSwatchPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '4px 0 8px' }}>
      <span style={{ color: COLORS.muted, fontSize: 12, marginRight: 4 }}>Color:</span>
      <button
        onClick={() => onChange(null)}
        disabled={disabled}
        title="Use category color"
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: value === null ? `2px solid ${COLORS.text}` : `1px solid ${COLORS.border}`,
          background: 'none',
          cursor: 'pointer',
        }}
      />
      {PALETTE.map((swatch) => (
        <button
          key={swatch}
          onClick={() => onChange(swatch)}
          disabled={disabled}
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: swatch,
            border: value === swatch ? `2px solid ${COLORS.text}` : '1px solid transparent',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 8,
  marginBottom: 8,
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  color: COLORS.text,
  fontSize: 13,
  boxSizing: 'border-box',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'none',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  color: COLORS.text,
  cursor: 'pointer',
  fontSize: 13,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '6px 16px',
  background: COLORS.primary,
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

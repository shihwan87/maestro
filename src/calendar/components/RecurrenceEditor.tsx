// Purpose: repeat-rule picker embedded in the Add/Edit-event form.
// Inputs: current rruleString (or null = no repeat), plus an onChange
// callback that receives the newly constructed rruleString (or null when
// the user turns Repeat off).
// Outputs: onChange fires whenever the user actually interacts with the
// editor. On mount we do NOT re-emit — this preserves any existing rule
// on an event being edited if the user never touches the editor. Only
// when a control is actually flipped do we build and emit a new string.
// Architecture note: RFC 5545 RRULE emission is done by hand (no
// rrule.js dependency here — the library is used only for expansion in
// api.ts). The strings we emit are the small, well-formed shapes rrule.js
// can round-trip: FREQ=DAILY, FREQ=WEEKLY[;BYDAY=...], FREQ=MONTHLY,
// FREQ=YEARLY, each with optional INTERVAL and UNTIL.

import { useState } from 'react';
import { COLORS } from '../../styles/theme';

interface RecurrenceEditorProps {
  value: string | null;
  onChange: (rruleString: string | null) => void;
}

type Preset = 'daily' | 'weekly' | 'monthly' | 'custom';
type Unit = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const; // Sun-first
type Weekday = (typeof WEEKDAY_CODES)[number];
const WEEKDAY_LABELS_KO: Record<Weekday, string> = {
  SU: '일',
  MO: '월',
  TU: '화',
  WE: '수',
  TH: '목',
  FR: '금',
  SA: '토',
};

interface EditorState {
  preset: Preset;
  byDay: Weekday[]; // used only when preset='daily' — all-7 means FREQ=DAILY, subset means FREQ=WEEKLY;BYDAY=
  interval: number;
  customUnit: Unit;
  until: string | null; // 'YYYY-MM-DD' local date, or null = never ends
}

function defaultState(): EditorState {
  return {
    preset: 'daily',
    byDay: [...WEEKDAY_CODES],
    interval: 1,
    customUnit: 'DAILY',
    until: nextSemesterEnd(),
  };
}

// Nearest strictly-future semester boundary: Aug 31 or Feb 28 of whichever
// year comes first. On the boundary day itself, jumps to the other boundary.
function nextSemesterEnd(): string {
  const today = new Date();
  const y = today.getFullYear();
  const candidates = [
    new Date(y, 1, 28),   // Feb 28 this year
    new Date(y, 7, 31),   // Aug 31 this year
    new Date(y + 1, 1, 28), // Feb 28 next year (fallback when both above are past)
  ].filter((d) => d.getTime() > today.getTime());
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const pick = candidates[0];
  return `${pick.getFullYear()}-${String(pick.getMonth() + 1).padStart(2, '0')}-${String(pick.getDate()).padStart(2, '0')}`;
}

// UNTIL in RFC 5545 must match DTSTART's value type. To cover both all-day
// and timed events with one shape, we emit end-of-day UTC. That's "any
// instant on the chosen date or before is still valid" — rrule.js accepts
// it either way.
function untilToRRuleFormat(until: string): string {
  const yyyy = until.slice(0, 4);
  const mm = until.slice(5, 7);
  const dd = until.slice(8, 10);
  return `${yyyy}${mm}${dd}T235959Z`;
}

function buildRRuleString(state: EditorState): string {
  const parts: string[] = [];
  if (state.preset === 'daily') {
    if (state.byDay.length === 7) {
      parts.push('FREQ=DAILY');
    } else if (state.byDay.length === 0) {
      // Zero selected weekdays isn't a valid repeat — fall back to daily so
      // the caller never gets a malformed RRULE, but the UI won't normally
      // let the user reach this branch (Save is disabled below).
      parts.push('FREQ=DAILY');
    } else {
      parts.push('FREQ=WEEKLY');
      parts.push(`BYDAY=${state.byDay.join(',')}`);
    }
  } else if (state.preset === 'weekly') {
    parts.push('FREQ=WEEKLY');
  } else if (state.preset === 'monthly') {
    parts.push('FREQ=MONTHLY');
  } else {
    parts.push(`FREQ=${state.customUnit}`);
    if (state.interval > 1) parts.push(`INTERVAL=${state.interval}`);
  }
  if (state.until) parts.push(`UNTIL=${untilToRRuleFormat(state.until)}`);
  return parts.join(';');
}

export function RecurrenceEditor({ value, onChange }: RecurrenceEditorProps) {
  const [state, setState] = useState<EditorState>(defaultState);
  // `repeatOn` starts from the incoming value so an event that already has
  // an rrule shows Repeat as on. If the user then toggles Repeat off,
  // onChange(null) fires; if they flip a control while Repeat is on,
  // onChange fires with the freshly-built rrule string. If they don't touch
  // anything, no onChange fires and the parent keeps the existing value.
  const [repeatOn, setRepeatOn] = useState(value !== null);
  const [touched, setTouched] = useState(false);

  function commit(next: EditorState, on: boolean) {
    setState(next);
    setRepeatOn(on);
    setTouched(true);
    onChange(on ? buildRRuleString(next) : null);
  }

  function toggleRepeat(on: boolean) {
    // If turning on for the first time (or turning back on after off), emit
    // the current state as an rrule. If off, emit null.
    commit(state, on);
  }

  function setPreset(p: Preset) {
    commit({ ...state, preset: p }, repeatOn);
  }

  function toggleWeekday(day: Weekday) {
    const has = state.byDay.includes(day);
    const nextDays = has ? state.byDay.filter((d) => d !== day) : [...state.byDay, day];
    // Keep byDay ordered so the emitted BYDAY string is stable
    nextDays.sort((a, b) => WEEKDAY_CODES.indexOf(a) - WEEKDAY_CODES.indexOf(b));
    commit({ ...state, byDay: nextDays }, repeatOn);
  }

  function setInterval(n: number) {
    if (!Number.isFinite(n) || n < 1) return;
    commit({ ...state, interval: Math.floor(n) }, repeatOn);
  }

  function setCustomUnit(u: Unit) {
    commit({ ...state, customUnit: u }, repeatOn);
  }

  function setUntil(next: string | null) {
    commit({ ...state, until: next }, repeatOn);
  }

  // Compact preview of what will be saved, so the user can see the effect
  // of their choices without opening the console.
  const previewRrule = repeatOn ? buildRRuleString(state) : null;
  const hasExistingUntouched = value !== null && !touched;

  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 4,
        padding: 10,
        marginBottom: 8,
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 6 }}>
        <input
          type="checkbox"
          checked={repeatOn}
          onChange={(e) => toggleRepeat(e.target.checked)}
        />
        Repeat this event
      </label>

      {hasExistingUntouched && (
        <p style={{ color: COLORS.muted, fontSize: 11, margin: '4px 0 8px' }}>
          Existing rule preserved. Change any field below to replace it.
        </p>
      )}

      {repeatOn && (
        <>
          {/* Preset row */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
            {(['daily', 'weekly', 'monthly', 'custom'] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                style={{
                  padding: '4px 10px',
                  background: state.preset === p ? COLORS.primary : 'none',
                  border: `1px solid ${state.preset === p ? COLORS.primary : COLORS.border}`,
                  borderRadius: 4,
                  color: state.preset === p ? '#fff' : COLORS.text,
                  cursor: 'pointer',
                  fontSize: 12,
                  textTransform: 'capitalize',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Daily: weekday checkboxes */}
          {state.preset === 'daily' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: COLORS.muted, fontSize: 11, marginBottom: 4 }}>
                Days of the week
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {WEEKDAY_CODES.map((d) => {
                  const active = state.byDay.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleWeekday(d)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 4,
                        background: active ? COLORS.primary : 'none',
                        border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
                        color: active ? '#fff' : COLORS.text,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {WEEKDAY_LABELS_KO[d]}
                    </button>
                  );
                })}
              </div>
              {state.byDay.length === 0 && (
                <p style={{ color: COLORS.danger, fontSize: 11, marginTop: 4 }}>
                  Pick at least one day.
                </p>
              )}
            </div>
          )}

          {/* Custom: interval + unit */}
          {state.preset === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ color: COLORS.muted, fontSize: 12 }}>Every</span>
              <input
                type="number"
                min={1}
                value={state.interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                style={{
                  width: 60,
                  padding: 4,
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 4,
                  color: COLORS.text,
                  fontSize: 13,
                }}
              />
              <select
                value={state.customUnit}
                onChange={(e) => setCustomUnit(e.target.value as Unit)}
                style={{
                  padding: 4,
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 4,
                  color: COLORS.text,
                  fontSize: 13,
                }}
              >
                <option value="DAILY">day(s)</option>
                <option value="WEEKLY">week(s)</option>
                <option value="MONTHLY">month(s)</option>
                <option value="YEARLY">year(s)</option>
              </select>
            </div>
          )}

          {/* Until */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: COLORS.muted, fontSize: 12 }}>Ends</span>
            <select
              value={state.until === null ? 'never' : 'on'}
              onChange={(e) =>
                setUntil(e.target.value === 'never' ? null : state.until ?? todayDateStr())
              }
              style={{
                padding: 4,
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 4,
                color: COLORS.text,
                fontSize: 13,
              }}
            >
              <option value="never">never</option>
              <option value="on">on</option>
            </select>
            {state.until !== null && (
              <input
                type="date"
                value={state.until}
                onChange={(e) => setUntil(e.target.value)}
                style={{
                  padding: 4,
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 4,
                  color: COLORS.text,
                  fontSize: 13,
                }}
              />
            )}
          </div>

          <div style={{ color: COLORS.muted, fontSize: 10, marginTop: 6 }}>
            {previewRrule ?? '(no rule)'}
          </div>
        </>
      )}
    </div>
  );
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

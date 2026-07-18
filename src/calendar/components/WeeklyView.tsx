// Purpose: full 7-column Mon-Sun grid — all-day/multi-day bars on top,
// hourly grid below, editable via clicks. Per module 23.
// Inputs: WeeklyViewProps.
// Outputs: onSelectInstance / onCreateNew callbacks fire on chip / empty-slot
// clicks respectively.
// Architecture note: rendering is split into `WeekGrid` (pure) and
// `WeekBody` (fetch + filter) so future read-only variants can compose
// without duplicating layout math. The Phase 5 "Next Week" tab that
// originally motivated the split was dropped as redundant with Weekly's
// prev/next nav — the split is kept because it's still the cleanest shape
// for this component. Bar stacking uses a greedy row assignment: a new bar
// drops onto the lowest row whose already-placed bars don't overlap its
// column span. Same shape as DailyView's layoutColumns, just keyed on
// day-columns instead of minutes.

import { useEffect, useState } from 'react';
import type { EventInstance, WeekLayout } from '../lib/types';
import { fetchEventInstances, weekRange } from '../lib/api';
import { layoutWeek } from '../lib/layout';
import { CATEGORY_COLOR, COLORS, textOnColor } from '../../styles/theme';

interface WeeklyViewProps {
  weekStart: string; // ISO date, Monday of the current week
  scope?: 'work' | 'personal' | 'all';
  showHolidays?: boolean;
  onSelectInstance?: (instance: EventInstance) => void;
  onCreateNew?: (defaults: { date: string; allDay: boolean; startHour?: number; endHour?: number }) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 32; // px — a bit tighter than DailyView's 40 to fit 24h + 7 cols on one screen
const MIN_BAR_HEIGHT = 16;
const ALL_DAY_BAR_HEIGHT = 20;
const ALL_DAY_BAR_GAP = 2;
const DAY_LABEL_KO = ['일', '월', '화', '수', '목', '금', '토']; // Sun-first

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function localDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateStr(d.toISOString());
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function passesFilters(
  instance: EventInstance,
  scope: 'work' | 'personal' | 'all',
  showHolidays: boolean,
): boolean {
  const { category } = instance.sourceEvent;
  if (category === 'holiday') return showHolidays;
  if (scope === 'all') return true;
  return category === scope;
}

// Greedy row assignment for all-day bars: bars are sorted by startCol (then
// endCol), each drops onto the lowest row whose bars-so-far don't overlap
// its span. A plain "one row per bar" would waste vertical space when a week
// has many single-day all-day events on different days that could sit on the
// same row without overlapping.
function assignAllDayRows(
  bars: WeekLayout['allDayBars'],
): Array<{ bar: WeekLayout['allDayBars'][number]; row: number }> {
  const sorted = [...bars].sort(
    (a, b) => a.startCol - b.startCol || a.endCol - b.endCol,
  );
  const rowEnds: number[] = []; // rowEnds[r] = the highest endCol of any bar placed in row r
  const assignments: Array<{ bar: WeekLayout['allDayBars'][number]; row: number }> = [];
  for (const bar of sorted) {
    let row = rowEnds.findIndex((endCol) => endCol < bar.startCol);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(bar.endCol);
    } else {
      rowEnds[row] = bar.endCol;
    }
    assignments.push({ bar, row });
  }
  return assignments;
}

// Same-day column-cluster layout as DailyView's layoutColumns, just applied
// per day-column rather than globally. Duplicated (small enough that a
// shared util would be more indirection than payoff, and Daily's version is
// already exported nowhere).
interface PositionedTimed {
  instance: EventInstance;
  startMin: number;
  endMin: number;
  column: number;
  totalColumns: number;
}

function layoutTimedForDay(instances: EventInstance[]): PositionedTimed[] {
  const withTimes = instances
    .map((instance) => {
      const startMin = minutesOfDay(instance.instanceStartTs);
      const endMinRaw = minutesOfDay(instance.instanceEndTs);
      const endMin = endMinRaw > startMin ? endMinRaw : startMin + 30;
      return { instance, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const positioned: PositionedTimed[] = [];

  function closeCluster(from: number, to: number) {
    const columnEnds: number[] = [];
    const assignments: Array<{ idx: number; column: number }> = [];
    for (let i = from; i < to; i++) {
      const ev = withTimes[i];
      let column = columnEnds.findIndex((end) => end <= ev.startMin);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(ev.endMin);
      } else {
        columnEnds[column] = ev.endMin;
      }
      assignments.push({ idx: i, column });
    }
    const totalColumns = columnEnds.length;
    for (const { idx, column } of assignments) {
      const ev = withTimes[idx];
      positioned.push({
        instance: ev.instance,
        startMin: ev.startMin,
        endMin: ev.endMin,
        column,
        totalColumns,
      });
    }
  }

  let clusterStart = 0;
  let clusterEnd = -Infinity;
  for (let i = 0; i < withTimes.length; i++) {
    if (i === clusterStart) {
      clusterEnd = withTimes[i].endMin;
      continue;
    }
    if (withTimes[i].startMin >= clusterEnd) {
      closeCluster(clusterStart, i);
      clusterStart = i;
      clusterEnd = withTimes[i].endMin;
    } else {
      clusterEnd = Math.max(clusterEnd, withTimes[i].endMin);
    }
  }
  if (withTimes.length > 0) closeCluster(clusterStart, withTimes.length);

  return positioned;
}

interface WeekGridProps {
  weekStart: string;
  layout: WeekLayout;
  holidayDates: Set<string>;
  onSelectInstance?: (instance: EventInstance) => void;
  onCreateNew?: (defaults: { date: string; allDay: boolean; startHour?: number; endHour?: number }) => void;
}

function WeekGrid({ weekStart, layout, holidayDates, onSelectInstance, onCreateNew }: WeekGridProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayLabelWidth = 40; // px — the 00:00/01:00 gutter; matches DailyView shape
  const rowAssignments = assignAllDayRows(layout.allDayBars);
  const allDayRowCount = rowAssignments.reduce((max, a) => Math.max(max, a.row + 1), 0);
  const allDayHeight =
    allDayRowCount === 0
      ? 24 // still show an empty band so the header rows sit above something visible
      : allDayRowCount * (ALL_DAY_BAR_HEIGHT + ALL_DAY_BAR_GAP) + ALL_DAY_BAR_GAP;
  const dayColWidthPct = `calc((100% - ${dayLabelWidth}px) / 7)`;

  const todayStr = localDateStr(new Date().toISOString());
  const weekStartYear = new Date(`${weekStart}T00:00:00`).getFullYear();

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: 'hidden' }}>
      {/* Column headers: one line per day — "M/D (요)" or "'YY/M/D (요)" at year boundary. */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ width: dayLabelWidth, flexShrink: 0 }} />
        {days.map((d, i) => {
          const dt = new Date(`${d}T00:00:00`);
          const m = dt.getMonth() + 1;
          const day = dt.getDate();
          const wd = DAY_LABEL_KO[i];
          const isNewYear = dt.getFullYear() !== weekStartYear;
          const dateLabel = isNewYear
            ? `'${String(dt.getFullYear()).slice(2)}/${m}/${day} (${wd})`
            : `${m}/${day} (${wd})`;

          const isToday = d === todayStr;
          const isWeekend = i === 0 || i === 6; // Sun or Sat (DAY_LABEL_KO is Sun-first)
          const isHoliday = holidayDates.has(d);
          const labelColor = isToday
            ? COLORS.primary
            : isWeekend || isHoliday
              ? COLORS.danger
              : COLORS.text;

          return (
            <div
              key={d}
              style={{
                width: dayColWidthPct,
                padding: '6px 4px',
                textAlign: 'center',
                fontSize: 12,
                color: labelColor,
                fontWeight: isToday ? 600 : 400,
                borderLeft: i > 0 ? `1px solid ${COLORS.border}` : 'none',
              }}
            >
              {dateLabel}
            </div>
          );
        })}
      </div>

      {/* All-day / multi-day zone — absolute-positioned bars over a container
          whose height comes from the greedy row assignment above. */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.bg,
        }}
      >
        <div
          style={{
            width: dayLabelWidth,
            flexShrink: 0,
            padding: '4px 4px 0',
            color: COLORS.muted,
            fontSize: 10,
            textAlign: 'right',
          }}
        >
          all-day
        </div>
        <div style={{ position: 'relative', flex: 1, height: allDayHeight }}>
          {/* Column dividers behind the bars, for visual alignment. */}
          {days.map((d, i) =>
            i === 0 ? null : (
              <div
                key={`divider-${d}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `calc(${(i / 7) * 100}%)`,
                  width: 1,
                  background: COLORS.border,
                }}
              />
            ),
          )}
          {rowAssignments.map(({ bar, row }) => {
            const { instance, startCol, endCol } = bar;
            const event = instance.sourceEvent;
            const color = event.color_override ?? CATEGORY_COLOR[event.category];
            const textColor = textOnColor(color);
            const leftPct = (startCol / 7) * 100;
            const widthPct = ((endCol - startCol + 1) / 7) * 100;
            const top = ALL_DAY_BAR_GAP + row * (ALL_DAY_BAR_HEIGHT + ALL_DAY_BAR_GAP);
            return (
              <button
                key={`${event.id}-${instance.instanceStartTs}-${startCol}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectInstance?.(instance);
                }}
                title={event.title}
                style={{
                  position: 'absolute',
                  top,
                  left: `calc(${leftPct}% + 2px)`,
                  width: `calc(${widthPct}% - 4px)`,
                  height: ALL_DAY_BAR_HEIGHT,
                  background: color,
                  color: textColor,
                  border: 'none',
                  borderRadius: 3,
                  padding: '0 6px',
                  fontSize: 11,
                  textAlign: 'left',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  cursor: onSelectInstance ? 'pointer' : 'default',
                }}
              >
                {event.task_id ? '● ' : ''}
                {event.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hourly grid: hour-label gutter, then 7 day columns. Timed events are
          absolutely positioned per day; clicking an empty area of a day-column
          opens the create modal at that day. */}
      <div style={{ display: 'flex', position: 'relative' }}>
        <div style={{ width: dayLabelWidth, flexShrink: 0 }}>
          {HOURS.map((hour) => (
            <div
              key={hour}
              style={{
                height: HOUR_HEIGHT,
                padding: '2px 4px 0',
                color: COLORS.muted,
                fontSize: 10,
                textAlign: 'right',
                borderBottom: hour < 23 ? `1px solid ${COLORS.border}` : 'none',
                boxSizing: 'border-box',
              }}
            >
              {pad2(hour)}:00
            </div>
          ))}
        </div>

        {days.map((d, dayIdx) => {
          const timedForDay = layout.timedByDay[d] ?? [];
          const positioned = layoutTimedForDay(timedForDay);
          return (
            <div
              key={d}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const h = Math.max(0, Math.min(23, Math.floor(y / HOUR_HEIGHT)));
                onCreateNew?.({ date: d, allDay: false, startHour: h, endHour: Math.min(h + 1, 23) });
              }}
              style={{
                width: dayColWidthPct,
                position: 'relative',
                borderLeft: dayIdx > 0 ? `1px solid ${COLORS.border}` : 'none',
                cursor: onCreateNew ? 'pointer' : 'default',
              }}
            >
              {/* Empty hour rows for grid lines. */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  style={{
                    height: HOUR_HEIGHT,
                    borderBottom: hour < 23 ? `1px solid ${COLORS.border}` : 'none',
                    boxSizing: 'border-box',
                  }}
                />
              ))}

              {/* Absolute-positioned timed bars for this day. */}
              <div
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              >
                {positioned.map(({ instance, startMin, endMin, column, totalColumns }) => {
                  const event = instance.sourceEvent;
                  const color = event.color_override ?? CATEGORY_COLOR[event.category];
                  const textColor = textOnColor(color);
                  const top = (startMin / 60) * HOUR_HEIGHT;
                  const height = Math.max(
                    MIN_BAR_HEIGHT,
                    ((endMin - startMin) / 60) * HOUR_HEIGHT,
                  );
                  const widthPct = 100 / totalColumns;
                  const leftPct = column * widthPct;
                  return (
                    <button
                      key={`${event.id}-${instance.instanceStartTs}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectInstance?.(instance);
                      }}
                      title={totalColumns > 1 ? `⚠ Time conflict — ${event.title}` : event.title}
                      style={{
                        position: 'absolute',
                        top,
                        left: `calc(${leftPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                        height,
                        background: color,
                        border: totalColumns > 1 ? '2px solid #ff6b6b' : 'none',
                        borderRadius: 3,
                        padding: '2px 4px',
                        color: textColor,
                        fontSize: 10,
                        textAlign: 'left',
                        cursor: onSelectInstance ? 'pointer' : 'default',
                        overflow: 'hidden',
                        pointerEvents: 'auto',
                        display: 'block',
                      }}
                    >
                      {totalColumns > 1 && <span style={{ fontSize: 9 }}>⚠ </span>}
                      {event.task_id ? '● ' : ''}
                      {event.title}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekBody({
  weekStart,
  scope = 'all',
  showHolidays = true,
  onSelectInstance,
  onCreateNew,
}: WeeklyViewProps) {
  const [instances, setInstances] = useState<EventInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEventInstances(weekRange(weekStart))
      .then((result) => {
        if (!cancelled) setInstances(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load events');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  useEffect(() => {
    // Silent refetch on tab focus — same rationale as DailyView (webhook /
    // Google-Calendar-side edits aren't pushed live; a plain focus refetch
    // is enough at personal scale).
    function refetchSilently() {
      fetchEventInstances(weekRange(weekStart))
        .then(setInstances)
        .catch(() => {});
    }
    window.addEventListener('focus', refetchSilently);
    document.addEventListener('visibilitychange', refetchSilently);
    return () => {
      window.removeEventListener('focus', refetchSilently);
      document.removeEventListener('visibilitychange', refetchSilently);
    };
  }, [weekStart]);

  if (loading) return <p style={{ color: COLORS.muted, padding: 16 }}>Loading…</p>;
  if (error) return <p style={{ color: COLORS.danger, padding: 16 }}>{error}</p>;

  // Collect holiday dates from ALL instances (before scope filtering) so
  // weekend/holiday column headers stay red even when showHolidays=false.
  const holidayDates = new Set(
    instances
      .filter((inst) => inst.sourceEvent.category === 'holiday')
      .map((inst) => localDateStr(inst.instanceStartTs)),
  );

  const filtered = instances.filter((i) => passesFilters(i, scope, showHolidays));
  const layout = layoutWeek(filtered, weekStart);

  return (
    <WeekGrid
      weekStart={weekStart}
      layout={layout}
      holidayDates={holidayDates}
      onSelectInstance={onSelectInstance}
      onCreateNew={onCreateNew}
    />
  );
}

export function WeeklyView(props: WeeklyViewProps) {
  return (
    <div style={{ padding: 16 }}>
      {props.onCreateNew && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => {
              const now = new Date();
              const h = now.getHours();
              props.onCreateNew?.({ date: props.weekStart, allDay: false, startHour: h, endHour: Math.min(h + 1, 23) });
            }}
            style={{
              padding: '4px 10px',
              background: 'none',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              color: COLORS.text,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            + Add event
          </button>
        </div>
      )}
      <WeekBody {...props} />
    </div>
  );
}

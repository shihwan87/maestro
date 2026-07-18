// Purpose: top all-day row + 00–24 hour grid for one day.
// Inputs: DailyViewProps (interface_contract.md module 22).
// Outputs: calls onSelectInstance when an event is clicked, onCreateNew when
// an empty hour slot or the "+ Add event" header button is clicked.
// Architecture note: clicking an hour row only triggers onCreateNew when
// that hour has no events (chip clicks stopPropagation so they open
// onSelectInstance instead) — an hour with events already has enough click
// targets without an ambiguous "click the gap between chips" affordance.

import { useEffect, useState } from 'react';
import type { EventInstance } from '../lib/types';
import { dayRange, fetchEventInstances } from '../lib/api';
import { layoutDay } from '../lib/layout';
import { CATEGORY_COLOR, COLORS, textOnColor } from '../../styles/theme';

interface DailyViewProps {
  date: string; // 'YYYY-MM-DD'
  scope?: 'work' | 'personal' | 'all';
  showHolidays?: boolean;
  onSelectInstance?: (instance: EventInstance) => void;
  onCreateNew?: (defaults: { date: string; allDay: boolean; startHour?: number; endHour?: number }) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 40; // px — fixed row height, needed so bar positions below are simple arithmetic
const MIN_BAR_HEIGHT = 20; // px — a very short event still needs a clickable/readable bar

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

interface PositionedInstance {
  instance: EventInstance;
  startMin: number;
  endMin: number;
  column: number; // 0-indexed column within its overlap cluster
  totalColumns: number; // column count needed for that cluster
}

// Classic calendar side-by-side layout: events that overlap in time split
// the available width instead of stacking on top of each other. Clusters
// of mutually-overlapping events are found first (a plain global column
// count would waste width — e.g. a 3-way overlap at noon would force an
// unrelated 2pm pair into 3 needlessly narrow columns too), then columns
// are assigned greedily within each cluster.
function layoutColumns(instances: EventInstance[]): PositionedInstance[] {
  const withTimes = instances
    .map((instance) => {
      const startMin = minutesOfDay(instance.instanceStartTs);
      const endMinRaw = minutesOfDay(instance.instanceEndTs);
      const endMin = endMinRaw > startMin ? endMinRaw : startMin + 30; // guard zero/odd-length instances
      return { instance, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const positioned: PositionedInstance[] = [];

  function closeCluster(from: number, to: number) {
    const columnEnds: number[] = []; // columnEnds[c] = end time of the last event placed in column c
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
      positioned.push({ instance: ev.instance, startMin: ev.startMin, endMin: ev.endMin, column, totalColumns });
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

interface EventChipProps {
  instance: EventInstance;
  hasConflict?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

function EventChip({ instance, hasConflict, onClick, style }: EventChipProps) {
  const event = instance.sourceEvent;
  const color = event.color_override ?? CATEGORY_COLOR[event.category];
  const textColor = textOnColor(color);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        width: '100%',
        textAlign: 'left',
        padding: '4px 8px',
        marginBottom: 4,
        background: color,
        border: hasConflict ? '2px solid #ff6b6b' : 'none',
        borderRadius: 4,
        color: textColor,
        cursor: 'pointer',
        fontSize: 13,
        overflow: 'hidden',
        ...style,
      }}
    >
      {hasConflict && <span title="Time conflict" style={{ fontSize: 11 }}>⚠</span>}
      {event.task_id && <span title="Linked to a task">●</span>}
      <span>{event.title}</span>
    </button>
  );
}

export function DailyView({
  date,
  scope = 'all',
  showHolidays = true,
  onSelectInstance,
  onCreateNew,
}: DailyViewProps) {
  const [instances, setInstances] = useState<EventInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEventInstances(dayRange(date))
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
  }, [date]);

  useEffect(() => {
    // Changes made elsewhere (a schemanager step edit propagating through
    // task-sync-webhook, or Google Calendar itself) never push to this tab —
    // there's no live subscription. Silently refetch whenever the tab
    // regains focus, so coming back to an already-open dashboard shows
    // current data without needing a manual page reload. No loading-state
    // toggle here on purpose — a background refresh shouldn't flash the
    // whole view back to "Loading…".
    function refetchSilently() {
      fetchEventInstances(dayRange(date))
        .then(setInstances)
        .catch(() => {}); // a failed background refresh just keeps stale data on screen
    }
    window.addEventListener('focus', refetchSilently);
    document.addEventListener('visibilitychange', refetchSilently);
    return () => {
      window.removeEventListener('focus', refetchSilently);
      document.removeEventListener('visibilitychange', refetchSilently);
    };
  }, [date]);

  if (loading) return <p style={{ color: COLORS.muted, padding: 16 }}>Loading…</p>;
  if (error) return <p style={{ color: COLORS.danger, padding: 16 }}>{error}</p>;

  const filtered = instances.filter((i) => passesFilters(i, scope, showHolidays));
  const { allDayRow, timedByHour } = layoutDay(filtered, date);

  return (
    <div style={{ padding: 16 }}>
      {onCreateNew && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => {
              const now = new Date();
              const h = now.getHours();
              onCreateNew({ date, allDay: false, startHour: h, endHour: Math.min(h + 1, 23) });
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

      <div
        style={{
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: 8,
          marginBottom: 12,
          minHeight: 32,
        }}
      >
        {allDayRow.length === 0 ? (
          <span style={{ color: COLORS.muted, fontSize: 12 }}>No all-day events</span>
        ) : (
          allDayRow.map((instance) => (
            <EventChip
              key={`${instance.sourceEvent.id}-${instance.instanceStartTs}`}
              instance={instance}
              onClick={() => onSelectInstance?.(instance)}
            />
          ))
        )}
      </div>

      <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 6, position: 'relative' }}>
        {HOURS.map((hour) => {
          const eventsThisHour = timedByHour[hour] ?? [];
          return (
            <div
              key={hour}
              onClick={() => {
                if (eventsThisHour.length === 0) {
                  onCreateNew?.({ date, allDay: false, startHour: hour, endHour: Math.min(hour + 1, 23) });
                }
              }}
              style={{
                display: 'flex',
                borderBottom: hour < 23 ? `1px solid ${COLORS.border}` : 'none',
                height: HOUR_HEIGHT,
                boxSizing: 'border-box',
                cursor: onCreateNew && eventsThisHour.length === 0 ? 'pointer' : 'default',
              }}
            >
              <div style={{ width: 56, flexShrink: 0, padding: '4px 8px', color: COLORS.muted, fontSize: 12 }}>
                {formatHour(hour)}
              </div>
              <div style={{ flex: 1 }} />
            </div>
          );
        })}

        {/* Event bars, positioned by real start/end time rather than confined
            to their starting hour's row, so a 2-4pm event visibly spans two
            hours instead of only appearing next to "14:00". timedByHour still
            buckets by start hour (unchanged, matches interface_contract.md's
            DayLayout shape) — flattening it back out here is just for
            rendering position, not a data-shape change. Overlapping events
            split the width via layoutColumns instead of stacking. */}
        <div style={{ position: 'absolute', top: 0, left: 56, right: 0, bottom: 0, pointerEvents: 'none' }}>
          {layoutColumns(HOURS.flatMap((hour) => timedByHour[hour] ?? [])).map(
            ({ instance, startMin, endMin, column, totalColumns }) => {
              const top = (startMin / 60) * HOUR_HEIGHT;
              const height = Math.max(MIN_BAR_HEIGHT, ((endMin - startMin) / 60) * HOUR_HEIGHT);
              const widthPct = 100 / totalColumns;
              const leftPct = column * widthPct;
              return (
                <div
                  key={`${instance.sourceEvent.id}-${instance.instanceStartTs}`}
                  style={{
                    position: 'absolute',
                    top,
                    height,
                    left: `calc(${leftPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                    pointerEvents: 'auto',
                  }}
                >
                  <EventChip
                    instance={instance}
                    hasConflict={totalColumns > 1}
                    onClick={() => onSelectInstance?.(instance)}
                    style={{ height: '100%', marginBottom: 0 }}
                  />
                </div>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}

// Purpose: pure grouping utils — splits EventInstance[] into all-day/multi-day
// vs. hourly-timed for one day (layoutDay) or one week (layoutWeek), per
// Design Lock #12.
// Inputs: EventInstance[] (already date-range-fetched, not necessarily
// pre-filtered), a 'YYYY-MM-DD' date string or weekStart date.
// Outputs: DayLayout / WeekLayout.
// Architecture note: layoutDay backs DailyView; layoutWeek backs WeeklyView
// and NextWeekPreview. All-day/multi-day instances become one bar per
// event with startCol/endCol (0=Mon .. 6=Sun) so the week grid can render
// one spanning element per event instead of 7 per-day fragments.

import type { DayLayout, EventInstance, WeekLayout } from './types';

function localDateStr(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Add `days` calendar days to a 'YYYY-MM-DD' string and return the result in
// the same format. Uses a Date built at local midnight so DST transitions
// and month boundaries are handled by the platform, not by hand.
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateStr(d.toISOString());
}

// Google Calendar (and the RFC 5545 iCal spec) store all-day events with an
// EXCLUSIVE end date — a one-day event on 2026-07-13 arrives as start=07-13,
// end=07-14. The importer preserves that shape in sched_events. When
// deciding which day columns to render an all-day bar on, we want the
// INCLUSIVE last covered date instead — otherwise every all-day event
// spans one extra day. Only applies when `all_day=true`; timed events that
// happen to cross midnight (23:00-01:00 the next day) really do cover two
// dates.
function inclusiveEndDate(instance: EventInstance): string {
  const endDate = localDateStr(instance.instanceEndTs);
  if (!instance.sourceEvent.all_day) return endDate;
  return addDays(endDate, -1);
}

export function layoutDay(instances: EventInstance[], date: string): DayLayout {
  const allDayRow: EventInstance[] = [];
  const timedByHour: Record<number, EventInstance[]> = {};

  for (const instance of instances) {
    const startDate = localDateStr(instance.instanceStartTs);
    const endDate = inclusiveEndDate(instance);

    // Doesn't cover this date at all.
    if (startDate > date || endDate < date) continue;

    if (instance.sourceEvent.all_day || startDate !== endDate) {
      allDayRow.push(instance);
      continue;
    }

    const hour = new Date(instance.instanceStartTs).getHours();
    if (!timedByHour[hour]) timedByHour[hour] = [];
    timedByHour[hour].push(instance);
  }

  return { allDayRow, timedByHour };
}

export function layoutWeek(instances: EventInstance[], weekStart: string): WeekLayout {
  // The 7 dates the grid covers, indexed 0=Sun .. 6=Sat.
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));
  const weekStartDate = days[0];
  const weekEndDate = days[6];

  const allDayBars: WeekLayout['allDayBars'] = [];
  const timedByDay: Record<string, EventInstance[]> = {};
  for (const day of days) timedByDay[day] = [];

  for (const instance of instances) {
    const startDate = localDateStr(instance.instanceStartTs);
    const endDate = inclusiveEndDate(instance);

    // Fully outside the visible week.
    if (endDate < weekStartDate || startDate > weekEndDate) continue;

    const isMultiDay = startDate !== endDate;
    if (instance.sourceEvent.all_day || isMultiDay) {
      // Clamp to visible range so a bar starting last week / ending next week
      // still renders as a partial bar covering only the days in view.
      const clampedStart = startDate < weekStartDate ? weekStartDate : startDate;
      const clampedEnd = endDate > weekEndDate ? weekEndDate : endDate;
      const startCol = days.indexOf(clampedStart);
      const endCol = days.indexOf(clampedEnd);
      if (startCol === -1 || endCol === -1) continue; // defensive; shouldn't happen after clamp
      allDayBars.push({ instance, startCol, endCol });
      continue;
    }

    // Same-day timed event — bucket to its day column.
    if (timedByDay[startDate]) timedByDay[startDate].push(instance);
  }

  return { allDayBars, timedByDay };
}

import { DateTime } from "luxon";

/**
 * Spec section 26: given a start time, an interval, and a timezone, lay out
 * one scheduled slot per clip — Video 01 at 18:00, Video 02 at 18:30, etc.
 * Uses Luxon so DST transitions inside a long schedule (e.g. 40 clips at 30
 * intervals with a DST change midway through) are handled correctly rather
 * than by naively adding milliseconds.
 */
export function computeScheduleSlots(params: {
  startAt: Date;
  intervalMin: number;
  timezone: string;
  count: number;
}): Date[] {
  const start = DateTime.fromJSDate(params.startAt, { zone: params.timezone });
  if (!start.isValid) {
    throw new Error(`Invalid start time or timezone: ${start.invalidReason}`);
  }

  const slots: Date[] = [];
  for (let i = 0; i < params.count; i++) {
    slots.push(start.plus({ minutes: params.intervalMin * i }).toJSDate());
  }
  return slots;
}

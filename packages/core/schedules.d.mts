import type { ScheduleDays, Weekday } from "./types";
export const weekdays: Weekday[];
export interface ScheduleSlot {
  start: number;
  end: number;
  days: Weekday[];
}
export function parseTime(value: string): number;
export function formatTime(minutes: number): string;
export function normalizeDays(days: unknown): ScheduleDays;
export function daysFromSlots(slots: ScheduleSlot[]): ScheduleDays;
export function slotsFromDays(days: ScheduleDays): ScheduleSlot[];

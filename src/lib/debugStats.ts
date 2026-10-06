// ============================================================================
// Debug-Auswertung für das Monatsraster. Rein lesend.
//
// Der Betrieb will am Raster selbst sehen, WARUM ein Plan so aussieht, wie er
// aussieht: wann der Laden leer steht, wer aufsperrt, wie voll jede Woche
// eines Minijobs ist – einschließlich der Woche, die im Vormonat begonnen hat.
// Bisher stand davon nur ein Teil im Dashboard, der Rest war nur mit einer
// eigenen Gegenprobe herauszufinden (so ist der leere Mittwoch im März 2026
// aufgefallen).
// ============================================================================

import type { Employee, Schedule, Shift } from "../types";
import { MINIJOB_FLEX_WEEKLY_HOURS, MINIJOB_MAX_WEEKLY_HOURS } from "../types";
import { analyzeSchedule } from "./analyze";
import { maxConsecutiveRun } from "./consecutive";
import { datesOfMonth } from "./demand";
import { publicHolidayNames, publicHolidays } from "./holidays";
import { peaksFor } from "./scheduler";
import { weekStartOf, weeksOfMonth } from "./weeks";
import { resolveDay } from "./workHours";

/** Breite eines Feldes im Besetzungsstreifen. */
export const SLOT_MINUTES = 30;

export type PeakDebug = {
  label: string;
  from: number;
  to: number;
  minStaff: number;
  required: number;
  ok: boolean;
};

export type DayDebug = {
  date: string;
  closed: boolean;
  holiday?: string;
  /** Arbeitszeit-Fenster; fehlt an geschlossenen Tagen. */
  window?: { start: number; end: number };
  /** Besetzung je SLOT_MINUTES ab Fensterbeginn (kleinster Wert im Feld). */
  slots: number[];
  /** Zeiträume, in denen der Laden offen ist, aber niemand da ist. */
  gaps: Array<[number, number]>;
  /** Kleinste Besetzung über das ganze Fenster. */
  minStaff: number;
  peaks: PeakDebug[];
  openers: string[];
  closers: string[];
  paidHours: number;
  /** Tages-Soll nach Wochentagsgewicht (wie analyze.ts). */
  targetHours: number;
};

/**
 * Kurzname für enge Zellen: bei vietnamesischen Namen (drei Wörter und mehr)
 * steht der Rufname am Ende („Hà Thị Châm" -> „Châm"), sonst vorne
 * („Safet Dibran" -> „Safet").
 */
export function shortName(name: string): string {
  const teile = name.trim().split(/\s+/);
  return teile.length >= 3 ? teile[teile.length - 1] : teile[0] ?? name;
}

function staffAt(onDay: Shift[], t: number): number {
  let n = 0;
  for (const s of onDay) if (s.startMinutes <= t && s.endMinutes > t) n++;
  return n;
}

export function buildDayDebug(schedule: Schedule): Map<string, DayDebug> {
  const holidays = publicHolidays(schedule.year);
  const names = publicHolidayNames(schedule.year);
  const overrides = Object.fromEntries(schedule.dateOverrides.map((o) => [o.date, o]));
  const analysis = analyzeSchedule({
    year: schedule.year,
    month: schedule.month,
    workHours: schedule.workHours,
    overrides,
    employees: schedule.employees,
    shifts: schedule.shifts,
  });
  const targetByDate = new Map(analysis.days.map((d) => [d.date, d.targetHours] as const));
  const nameById = new Map(schedule.employees.map((e) => [e.id, shortName(e.name)] as const));

  const out = new Map<string, DayDebug>();
  for (const date of datesOfMonth(schedule.year, schedule.month)) {
    const day = resolveDay(schedule.workHours, date, holidays, overrides);
    const onDay = schedule.shifts.filter((s) => s.date === date);
    const paidHours = onDay.reduce((a, s) => a + s.paidMinutes, 0) / 60;
    const base: DayDebug = {
      date,
      closed: day.closed,
      holiday: names.get(date),
      slots: [],
      gaps: [],
      minStaff: 0,
      peaks: [],
      openers: [],
      closers: [],
      paidHours,
      targetHours: targetByDate.get(date) ?? 0,
    };
    if (day.closed) {
      out.set(date, base);
      continue;
    }

    const { startMinutes: start, endMinutes: end } = day.window;
    // Minutengenau – ein Raster, das nur alle halbe Stunde misst, übersieht
    // eine Lücke von 20 Minuten.
    let minStaff = Number.POSITIVE_INFINITY;
    let gapFrom: number | null = null;
    const slots: number[] = [];
    for (let t = start; t < end; t++) {
      const n = staffAt(onDay, t);
      minStaff = Math.min(minStaff, n);
      const slot = Math.floor((t - start) / SLOT_MINUTES);
      slots[slot] = slots[slot] === undefined ? n : Math.min(slots[slot], n);
      if (n === 0 && gapFrom === null) gapFrom = t;
      if (n > 0 && gapFrom !== null) {
        base.gaps.push([gapFrom, t]);
        gapFrom = null;
      }
    }
    if (gapFrom !== null) base.gaps.push([gapFrom, end]);

    for (const peak of peaksFor(day.window)) {
      const from = Math.max(peak.startMinutes, start);
      const to = Math.min(peak.endMinutes, end);
      if (to <= from) continue;
      let m = Number.POSITIVE_INFINITY;
      for (let t = from; t < to; t++) m = Math.min(m, staffAt(onDay, t));
      base.peaks.push({ label: peak.label, from, to, minStaff: m, required: peak.minStaff, ok: m >= peak.minStaff });
    }

    base.window = { start, end };
    base.slots = slots;
    base.minStaff = Number.isFinite(minStaff) ? minStaff : 0;
    base.openers = onDay.filter((s) => s.startMinutes <= start).map((s) => nameById.get(s.employeeId) ?? s.employeeId);
    base.closers = onDay.filter((s) => s.endMinutes >= end).map((s) => nameById.get(s.employeeId) ?? s.employeeId);
    out.set(date, base);
  }
  return out;
}

/** Ganze Kalenderwoche Mo–So als „29.12.–04.01." (auch über die Monatsgrenze). */
export function fullWeekLabel(weekStart: string): string {
  const first = new Date(`${weekStart}T12:00:00`);
  const last = new Date(first);
  last.setDate(last.getDate() + 6);
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
  return `${dm(first)}–${dm(last)}`;
}

export type WeekDebug = {
  weekStart: string;
  /** „26.01.–01.02." */
  label: string;
  days: number;
  hours: number;
  /** Davon aus dem Vormonat (Schedule.carryOver). */
  carryDays: number;
  carryHours: number;
  /** Mehr Arbeitstage als maxDaysPerWeek. */
  tooManyDays: boolean;
  /** Nur Minijob: "ok" ≤ 10 h, "flex" ≤ 12 h (Nachschlag), "over" darüber. */
  minijob?: "ok" | "flex" | "over";
};

export type EmployeeDebug = {
  workDays: number;
  minShiftHours: number;
  maxShiftHours: number;
  /** Längste Kette am Stück, einschließlich Ende des Vormonats. */
  maxRun: number;
  weeks: WeekDebug[];
};

export function buildEmployeeDebug(
  employee: Employee,
  schedule: Schedule,
): EmployeeDebug {
  const own = schedule.shifts.filter((s) => s.employeeId === employee.id);
  const carry = (schedule.carryOver ?? []).filter((s) => s.employeeId === employee.id);
  const lengths = own.map((s) => s.paidMinutes / 60);

  const weeks: WeekDebug[] = weeksOfMonth(schedule.year, schedule.month).map((w) => {
    const inWeek = own.filter((s) => weekStartOf(s.date) === w.weekStart);
    const carryInWeek = carry.filter((s) => weekStartOf(s.date) === w.weekStart);
    const all = [...carryInWeek, ...inWeek];
    const days = new Set(all.map((s) => s.date)).size;
    const hours = all.reduce((a, s) => a + s.paidMinutes, 0) / 60;
    return {
      weekStart: w.weekStart,
      label: fullWeekLabel(w.weekStart),
      days,
      hours,
      carryDays: new Set(carryInWeek.map((s) => s.date)).size,
      carryHours: carryInWeek.reduce((a, s) => a + s.paidMinutes, 0) / 60,
      tooManyDays: employee.maxDaysPerWeek ? days > employee.maxDaysPerWeek : days > 6,
      minijob:
        employee.employmentType !== "MINIJOB"
          ? undefined
          : hours > MINIJOB_FLEX_WEEKLY_HOURS
            ? "over"
            : hours > MINIJOB_MAX_WEEKLY_HOURS
              ? "flex"
              : "ok",
    };
  });

  return {
    workDays: new Set(own.map((s) => s.date)).size,
    minShiftHours: lengths.length ? Math.min(...lengths) : 0,
    maxShiftHours: lengths.length ? Math.max(...lengths) : 0,
    maxRun: maxConsecutiveRun([...carry, ...own].map((s) => s.date)),
    weeks,
  };
}

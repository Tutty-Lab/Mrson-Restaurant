// ============================================================================
// Wochen eines Monats. Grundlage für den Wochen-Ausdruck des Dienstplans.
//
// Eine Woche läuft Montag bis Sonntag (deutsche/ISO-Zählung). Die erste und
// letzte Woche eines Monats ragen meist in den Nachbarmonat hinein; gedruckt
// werden trotzdem nur die Tage, die IN diesem Monat liegen – der Plan gilt
// immer für genau einen Monat.
// ============================================================================

import { format, startOfWeek } from "date-fns";
import { datesOfMonth, parseIsoDate } from "./demand";

export type MonthWeek = {
  /** ISO-Datum des Montags dieser Woche (kann im Vormonat liegen). */
  weekStart: string;
  /** Tage dieser Woche, die im Monat liegen – aufsteigend. */
  dates: string[];
  /** Kurzbeschriftung, z.B. „01.06.–07.06." */
  label: string;
};

/** Montag der Woche, in der `isoDate` liegt. */
export function weekStartOf(isoDate: string): string {
  return format(startOfWeek(parseIsoDate(isoDate), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function shortDe(isoDate: string): string {
  const [, m, d] = isoDate.split("-");
  return `${d}.${m}.`;
}

/**
 * Alle Wochen, die Tage dieses Monats enthalten – in Reihenfolge.
 * month ist 1-basiert.
 */
export function weeksOfMonth(year: number, month: number): MonthWeek[] {
  const byStart = new Map<string, string[]>();

  for (const iso of datesOfMonth(year, month)) {
    const start = weekStartOf(iso);
    const list = byStart.get(start);
    if (list) list.push(iso);
    else byStart.set(start, [iso]);
  }

  return [...byStart.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, dates]) => ({
      weekStart,
      dates,
      label: `${shortDe(dates[0])}–${shortDe(dates[dates.length - 1])}`,
    }));
}

/**
 * Die sechs Tage vor dem Monatsersten – so weit kann eine Kalenderwoche oder
 * eine erlaubte Sechs-Tage-Kette in den Vormonat zurückreichen.
 */
export const CARRY_OVER_DAYS = 6;

/**
 * Dienste vom Ende des Vormonats, die für den neuen Monat noch zählen
 * (Minijob-Wochendeckel, Tage je Woche, Sechs-Tage-Kette). `Schedule` hält
 * nur einen Monat; ohne diesen Vorlauf wäre der Vormonat beim Planen
 * vergessen – siehe GenerateInput.priorShifts.
 */
export function carryOverFor<T extends { date: string }>(
  shifts: T[],
  year: number,
  month: number,
): T[] {
  const first = parseIsoDate(datesOfMonth(year, month)[0]);
  const from = new Date(first);
  from.setDate(from.getDate() - CARRY_OVER_DAYS);
  const von = format(from, "yyyy-MM-dd");
  const bis = format(first, "yyyy-MM-dd");
  return shifts.filter((s) => s.date >= von && s.date < bis);
}

// ============================================================================
// Wann darf eine Person überhaupt eingeplant werden?
//
// Drei Gründe sprechen dagegen, und alle kommen vom Nutzer, nicht aus der
// Rechnung: ein Tag außerhalb des Beschäftigungszeitraums (Eintritt/Austritt),
// ein Wochentag, an dem die Person grundsätzlich nicht arbeitet, und ein
// eingetragener Urlaubstag.
//
// Alles steht hier an EINER Stelle, weil der Scheduler an mehreren Stellen
// Termine vergibt: beim ersten Verteilen, beim Verschieben und beim Tauschen.
// Bei einer früheren Filiale standen Sonderregeln nur im ersten Schritt – die
// Reparaturläufe danach haben sie klaglos wieder kaputtgemacht.
// ============================================================================

import type { Employee } from "../types";
import { URLAUB_DAYS_PER_YEAR } from "../types";
import { datesOfMonth, parseIsoDate, weekdayKeyOf } from "./demand";

/** Urlaubstage dieser Person, als Set für schnelles Nachschlagen. */
export function vacationSet(employee: Employee): Set<string> {
  return new Set(employee.vacationDates ?? []);
}

/**
 * Arbeitet diese Person an diesem Wochentag überhaupt?
 *
 * Leere oder fehlende Liste heißt "keine Einschränkung". Eine leere Liste als
 * "arbeitet nie" zu lesen wäre die gefährlichere Auslegung: wer das Häkchen
 * noch nicht gesetzt hat, wäre plötzlich unplanbar.
 */
export function worksOnWeekday(employee: Employee, isoDate: string): boolean {
  const tage = employee.availableWeekdays;
  if (!tage || tage.length === 0) return true;
  return tage.includes(weekdayKeyOf(parseIsoDate(isoDate)));
}

/** Ist die Person an diesem Tag im Urlaub? */
export function onVacation(employee: Employee, isoDate: string): boolean {
  return (employee.vacationDates ?? []).includes(isoDate);
}

/**
 * Ist die Person an diesem Tag überhaupt beschäftigt (zwischen Eintritt und
 * Austritt, beide einschließlich)? ISO-Daten lassen sich als Text vergleichen.
 */
export function employedOn(employee: Employee, isoDate: string): boolean {
  if (employee.startDate && isoDate < employee.startDate) return false;
  if (employee.endDate && isoDate > employee.endDate) return false;
  return true;
}

/**
 * Die eine Frage, die jeder Planungsschritt stellen muss: darf diese Person an
 * diesem Datum arbeiten?
 */
export function mayWorkOn(employee: Employee, isoDate: string): boolean {
  return (
    employedOn(employee, isoDate) &&
    worksOnWeekday(employee, isoDate) &&
    !onVacation(employee, isoDate)
  );
}

/** Ist die Person an mindestens einem Tag des Monats beschäftigt? */
export function employedInMonth(employee: Employee, year: number, month: number): boolean {
  return datesOfMonth(year, month).some((d) => employedOn(employee, d));
}

/**
 * Monats-Soll unter Berücksichtigung von Eintritt und Austritt.
 *
 * Ganzer Monat beschäftigt => das eingetragene Soll unverändert. Kommt oder
 * geht jemand mitten im Monat, wird anteilig gerechnet: Soll × (offene Tage im
 * Beschäftigungszeitraum / offene Tage des Monats), auf ganze Stunden gerundet
 * (der Scheduler plant nur ganze Stunden). Was unter der kürzesten Schicht
 * bliebe, wird 0 – ein 2-h-Soll wäre unplanbar und würde den ganzen Monat
 * blockieren.
 */
export function monthTargetMinutes(
  employee: Employee,
  year: number,
  month: number,
  isOpen: (isoDate: string) => boolean,
): number {
  const offen = datesOfMonth(year, month).filter(isOpen);
  const beschaeftigt = offen.filter((d) => employedOn(employee, d));
  if (beschaeftigt.length === offen.length) return employee.targetMinutes;
  if (offen.length === 0 || beschaeftigt.length === 0) return 0;
  const stunden = Math.round(
    ((employee.targetMinutes / 60) * beschaeftigt.length) / offen.length,
  );
  return stunden < 3 ? 0 : stunden * 60;
}

/**
 * Die Belegschaft eines Monats: nur wer im Monat beschäftigt ist, mit dem
 * anteiligen Soll. Das ist die Liste, mit der geplant, geprüft und gedruckt
 * wird – die volle Liste braucht nur der Tab Nhân viên.
 */
export function employeesForMonth(
  employees: Employee[],
  year: number,
  month: number,
  isOpen: (isoDate: string) => boolean,
): Employee[] {
  return employees
    .filter((e) => employedInMonth(e, year, month))
    .map((e) => {
      const soll = monthTargetMinutes(e, year, month, isOpen);
      return soll === e.targetMinutes ? e : { ...e, targetMinutes: soll };
    });
}

/** Wie viele Urlaubstage hat die Person in diesem Jahr eingetragen? */
export function vacationDaysInYear(employee: Employee, year: number): number {
  const praefix = `${year}-`;
  return (employee.vacationDates ?? []).filter((d) => d.startsWith(praefix)).length;
}

/** Jahresanspruch dieser Person in Arbeitstagen. */
export function vacationEntitlement(employee: Employee): number {
  return URLAUB_DAYS_PER_YEAR[employee.employmentType];
}

/** Urlaubstage im geplanten Monat, aufsteigend sortiert. */
export function vacationDatesInMonth(
  employee: Employee,
  year: number,
  month: number,
): string[] {
  const praefix = `${year}-${String(month).padStart(2, "0")}-`;
  return (employee.vacationDates ?? []).filter((d) => d.startsWith(praefix)).sort();
}

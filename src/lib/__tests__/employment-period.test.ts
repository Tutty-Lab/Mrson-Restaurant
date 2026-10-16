// ============================================================================
// Eintritt und Austritt: wer im Monat nicht beschäftigt ist, fehlt in Plan und
// Prüfung; wer mitten im Monat kommt oder geht, bekommt das Soll anteilig und
// keinen Dienst außerhalb seines Zeitraums.
// ============================================================================

import { describe, expect, it } from "vitest";
import { generateSchedule } from "../scheduler";
import { DEFAULT_WORK_HOURS, isDayClosed } from "../workHours";
import { publicHolidays } from "../holidays";
import {
  employedOn,
  employeesForMonth,
  mayWorkOn,
  monthTargetMinutes,
} from "../availability";
import type { Employee } from "../../types";

const YEAR = 2026;

const emp = (
  id: string,
  type: Employee["employmentType"],
  hours: number,
  extra: Partial<Employee> = {},
): Employee => ({ id, name: id, employmentType: type, targetMinutes: hours * 60, ...extra });

const holidays = publicHolidays(YEAR);
const isOpen = (iso: string) => !isDayClosed(DEFAULT_WORK_HOURS, iso, holidays, {});

describe("employedOn", () => {
  const e = emp("a", "MINIJOB", 43, { startDate: "2026-03-01", endDate: "2026-05-31" });

  it("zählt Eintritt und Austritt als Arbeitstage mit", () => {
    expect(employedOn(e, "2026-02-28")).toBe(false);
    expect(employedOn(e, "2026-03-01")).toBe(true);
    expect(employedOn(e, "2026-05-31")).toBe(true);
    expect(employedOn(e, "2026-06-01")).toBe(false);
  });

  it("ohne Daten ist jeder Tag möglich", () => {
    expect(employedOn(emp("b", "VOLLZEIT", 160), "2030-01-01")).toBe(true);
  });

  it("mayWorkOn beachtet den Zeitraum", () => {
    expect(mayWorkOn(e, "2026-06-05")).toBe(false);
  });
});

describe("employeesForMonth", () => {
  const team = [
    emp("immer", "VOLLZEIT", 173),
    emp("jan-feb", "MINIJOB", 43, { endDate: "2026-02-28" }),
    emp("ab-juni", "MINIJOB", 43, { startDate: "2026-06-01" }),
  ];

  it("nimmt nur, wer im Monat beschäftigt ist", () => {
    expect(employeesForMonth(team, YEAR, 1, isOpen).map((e) => e.id)).toEqual(["immer", "jan-feb"]);
    expect(employeesForMonth(team, YEAR, 4, isOpen).map((e) => e.id)).toEqual(["immer"]);
    expect(employeesForMonth(team, YEAR, 7, isOpen).map((e) => e.id)).toEqual(["immer", "ab-juni"]);
  });

  it("ganzer Monat => Soll unverändert", () => {
    const jan = employeesForMonth(team, YEAR, 1, isOpen);
    expect(jan.find((e) => e.id === "jan-feb")!.targetMinutes).toBe(43 * 60);
  });
});

describe("monthTargetMinutes", () => {
  it("rechnet anteilig nach offenen Tagen und rundet auf ganze Stunden", () => {
    // Eintritt am 16.07.2026: etwa die Hälfte der offenen Tage.
    const e = emp("mitte", "VOLLZEIT", 160, { startDate: "2026-07-16" });
    const soll = monthTargetMinutes(e, YEAR, 7, isOpen);
    expect(soll % 60).toBe(0);
    expect(soll).toBeGreaterThan(60 * 60);
    expect(soll).toBeLessThan(100 * 60);
  });

  it("ein Rest unter der kürzesten Schicht wird 0", () => {
    const e = emp("letzter-tag", "MINIJOB", 43, { startDate: "2026-07-31" });
    expect(monthTargetMinutes(e, YEAR, 7, isOpen)).toBe(0);
  });
});

describe("Scheduler mit Eintritt mitten im Monat", () => {
  it("plant keinen Dienst vor dem Eintritt und trifft das anteilige Soll", () => {
    const team = [
      emp("v1", "VOLLZEIT", 173),
      emp("v2", "VOLLZEIT", 162),
      emp("neu", "MINIJOB", 43, { startDate: "2026-07-13" }),
    ];
    const employees = employeesForMonth(team, YEAR, 7, isOpen);
    const shifts = generateSchedule({ year: YEAR, month: 7, workHours: DEFAULT_WORK_HOURS, employees });

    const neu = shifts.filter((s) => s.employeeId === "neu");
    expect(neu.every((s) => s.date >= "2026-07-13")).toBe(true);
    const soll = employees.find((e) => e.id === "neu")!.targetMinutes;
    expect(neu.reduce((a, s) => a + s.paidMinutes, 0)).toBe(soll);
  });
});

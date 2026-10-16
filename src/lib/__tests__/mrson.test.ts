// Mrson: Öffnungszeiten, Ruhetag, Wochenendgewicht und Urlaub im Planer.
import { describe, expect, it } from "vitest";
import { generateSchedule } from "../scheduler";
import { storeById } from "../stores";
import { datesOfMonth, parseIsoDate, weekdayKeyOf } from "../demand";
import { DEFAULT_WORK_HOURS, resolveDay } from "../workHours";
import { publicHolidays } from "../holidays";
import { monthlyTargetMinutesFor } from "../contract";
import { validateSchedule } from "../validation";
import type { Employee } from "../../types";

const store = storeById("mrson");
const plan = (employees: Employee[], month = 9) =>
  generateSchedule({
    year: 2026, month, workHours: DEFAULT_WORK_HOURS, employees,
    rules: store.staffingRules, weights: store.dayWeights, storeTag: store.id,
  });

describe("Mrson", () => {
  const employees = store.sampleEmployees();
  const shifts = plan(employees);

  it("plant montags nie, und jeder Dienst liegt in 11:30–22:00", () => {
    for (const s of shifts) {
      expect(weekdayKeyOf(parseIsoDate(s.date))).not.toBe("monday");
      expect(s.startMinutes).toBeGreaterThanOrEqual(11 * 60 + 30);
      expect(s.endMinutes).toBeLessThanOrEqual(22 * 60);
    }
  });

  it("MJ1 arbeitet nur freitags und sonntags", () => {
    for (const s of shifts.filter((x) => x.employeeId === "MJ1")) {
      expect(["friday", "sunday"]).toContain(weekdayKeyOf(parseIsoDate(s.date)));
    }
  });

  it("Wochenende bekommt mehr Stunden als Dienstag–Donnerstag", () => {
    const perDay = new Map<string, number>();
    for (const s of shifts) {
      const key = weekdayKeyOf(parseIsoDate(s.date));
      perDay.set(key, (perDay.get(key) ?? 0) + s.paidMinutes);
    }
    const weekend = ["friday", "saturday", "sunday"].reduce((t, k) => t + (perDay.get(k) ?? 0), 0);
    const midweek = ["tuesday", "wednesday", "thursday"].reduce((t, k) => t + (perDay.get(k) ?? 0), 0);
    expect(weekend).toBeGreaterThan(midweek);
  });

  it("Urlaub: an Urlaubstagen kein Dienst, das Soll bleibt erreicht", () => {
    const vacation = ["2026-09-08", "2026-09-09", "2026-09-10"];
    const team = employees.map((e) => (e.id === "ST1" ? { ...e, vacationDates: vacation } : e));
    const result = plan(team);
    const st1 = result.filter((s) => s.employeeId === "ST1");
    expect(st1.some((s) => vacation.includes(s.date))).toBe(false);
    const openDates = datesOfMonth(2026, 9).filter((d) => !resolveDay(DEFAULT_WORK_HOURS, d, publicHolidays(2026), {}).closed);
    const soll = monthlyTargetMinutesFor(team[0], openDates);
    expect(soll - st1.reduce((t, s) => t + s.paidMinutes, 0)).toBeLessThan(30);
  });

  it("warnt bei mehr Urlaub als dem Jahresanspruch", () => {
    const days = datesOfMonth(2026, 9).slice(0, 10);
    const minijob = { ...employees.find((e) => e.id === "MJ2")!, vacationDates: days };
    const result = validateSchedule([minijob], [], 2026);
    expect(result.errors.some((e) => e.severity === "warning" && e.message.includes("vượt 8 ngày"))).toBe(true);
  });
});

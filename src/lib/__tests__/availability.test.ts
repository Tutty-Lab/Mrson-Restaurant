// ============================================================================
// Die beiden Regeln, die der Betrieb selbst setzt: an welchen Wochentagen
// jemand arbeitet, und wann jemand Urlaub hat.
//
// Beide gehen den Scheduler mehrfach an – beim ersten Verteilen, beim
// Verschieben und beim Tauschen. Geprüft wird deshalb das ENDERGEBNIS, nicht
// der einzelne Schritt: bei einer anderen Filiale standen Sonderregeln nur im
// ersten Schritt, und die Reparaturläufe danach haben sie klaglos wieder
// kaputtgemacht.
// ============================================================================

import { describe, expect, it } from "vitest";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { DEFAULT_WORK_HOURS } from "../workHours";
import { weekStartOf } from "../weeks";
import { parseIsoDate, weekdayKeyOf } from "../demand";
import { MINIJOB_MAX_WEEKLY_HOURS, type Employee } from "../../types";

const YEAR = 2026;
const MONTH = 8;

const emp = (
  id: string,
  type: Employee["employmentType"],
  hours: number,
  extra: Partial<Employee> = {},
): Employee => ({ id, name: id, employmentType: type, targetMinutes: hours * 60, ...extra });

const plane = (employees: Employee[]) =>
  generateSchedule({ year: YEAR, month: MONTH, workHours: DEFAULT_WORK_HOURS, employees });

describe("Feste Arbeitstage", () => {
  const mini = emp("mini-fr-so", "MINIJOB", 30, {
    availableWeekdays: ["friday", "sunday"],
  });
  const team = [emp("st-1", "VOLLZEIT", 160), emp("st-2", "VOLLZEIT", 160), mini];
  const shifts = plane(team);

  it("plant diese Person NUR an ihren Wochentagen", () => {
    const fremd = shifts
      .filter((s) => s.employeeId === mini.id)
      .map((s) => weekdayKeyOf(parseIsoDate(s.date)))
      .filter((k) => k !== "friday" && k !== "sunday");
    expect(fremd).toEqual([]);
  });

  it("trifft ihr Soll trotzdem exakt", () => {
    const summe = shifts
      .filter((s) => s.employeeId === mini.id)
      .reduce((a, s) => a + s.paidMinutes, 0);
    expect(summe).toBe(mini.targetMinutes);
  });

  it("zwei Arbeitstage in der Woche heißen zwei Dienste, nicht einen langen", () => {
    // Vorgabe des Betriebs. Ein einziger 9-h-Dienst würde die Wochenstunden
    // auf einen Schlag verbrauchen und den zweiten Tag ausfallen lassen.
    const proWoche = new Map<string, number>();
    for (const s of shifts.filter((x) => x.employeeId === mini.id)) {
      const wk = weekStartOf(s.date);
      proWoche.set(wk, (proWoche.get(wk) ?? 0) + 1);
    }
    // In mindestens einer vollen Woche stehen beide Tage.
    expect(Math.max(...proWoche.values())).toBe(2);
  });

  it("leere Liste heißt 'jeder Tag', nicht 'kein Tag'", () => {
    const ohne = emp("frei", "VOLLZEIT", 160, { availableWeekdays: [] });
    const plan = plane([ohne, emp("st-2", "VOLLZEIT", 160)]);
    expect(plan.filter((s) => s.employeeId === ohne.id).length).toBeGreaterThan(0);
  });
});

describe("Minijob: höchstens 10 Stunden je Woche", () => {
  const minis = [
    emp("st-1", "VOLLZEIT", 160),
    emp("mj-1", "MINIJOB", 34),
    emp("mj-2", "MINIJOB", 31),
  ];
  const shifts = plane(minis);

  it("reißt den Wochendeckel in keiner einzigen Woche", () => {
    const drueber: string[] = [];
    for (const e of minis.filter((x) => x.employmentType === "MINIJOB")) {
      const proWoche = new Map<string, number>();
      for (const s of shifts.filter((x) => x.employeeId === e.id)) {
        const wk = weekStartOf(s.date);
        proWoche.set(wk, (proWoche.get(wk) ?? 0) + s.paidMinutes / 60);
      }
      for (const [wk, h] of proWoche) {
        if (h > MINIJOB_MAX_WEEKLY_HOURS) drueber.push(`${e.id} ${wk}: ${h}h`);
      }
    }
    expect(drueber).toEqual([]);
  });
});

describe("Urlaub", () => {
  const urlauber = emp("st-1", "VOLLZEIT", 160, {
    vacationDates: ["2026-08-10", "2026-08-11", "2026-08-12"],
  });
  const shifts = plane([urlauber, emp("st-2", "VOLLZEIT", 160), emp("mj-1", "MINIJOB", 31)]);

  it("plant an eingetragenen Urlaubstagen keinen Dienst", () => {
    const trotzdem = shifts
      .filter((s) => s.employeeId === urlauber.id)
      .filter((s) => (urlauber.vacationDates ?? []).includes(s.date));
    expect(trotzdem).toEqual([]);
  });

  it("trifft das Monats-Soll trotz Urlaub exakt", () => {
    const summe = shifts
      .filter((s) => s.employeeId === urlauber.id)
      .reduce((a, s) => a + s.paidMinutes, 0);
    expect(summe).toBe(urlauber.targetMinutes);
  });

  it("warnt, sobald der Jahresanspruch überschritten ist", () => {
    // 25 Tage bei einem Anspruch von 24.
    const zuViel = emp("st-1", "VOLLZEIT", 160, {
      vacationDates: Array.from({ length: 25 }, (_, i) => `2026-03-${String(i + 1).padStart(2, "0")}`),
    });
    const result = validateSchedule([zuViel], [], YEAR);
    expect(result.errors.some((e) => e.message.includes("nghỉ phép 25 ngày"))).toBe(true);
  });

  it("zählt nur das geprüfte Jahr, nicht die Tage aus anderen Jahren", () => {
    const gemischt = emp("st-1", "VOLLZEIT", 160, {
      vacationDates: ["2025-03-01", "2025-03-02", "2026-03-01"],
    });
    const result = validateSchedule([gemischt], [], YEAR);
    expect(result.errors.filter((e) => e.message.includes("nghỉ phép"))).toEqual([]);
  });

  it("Minijob hat einen kleineren Anspruch (8 Tage)", () => {
    const mj = emp("mj-1", "MINIJOB", 31, {
      vacationDates: Array.from({ length: 9 }, (_, i) => `2026-03-${String(i + 1).padStart(2, "0")}`),
    });
    const result = validateSchedule([mj], [], YEAR);
    expect(result.errors.some((e) => e.message.includes("vượt 8 ngày"))).toBe(true);
  });
});

describe("Obergrenze der Belegschaft", () => {
  // Gezählt wird die GESAMTE Belegschaft. Früher gab es zwei getrennte Zahlen
  // (3 Stammkräfte, 5 Minijobs); der Betrieb hat das auf eine zusammengezogen –
  // wie sich die Leute auf die Anstellungsarten verteilen, ist seine Sache.
  const viele = (n: number, type: Employee["employmentType"]) =>
    Array.from({ length: n }, (_, i) => emp(`${type}-${i}`, type, 30));

  it("warnt erst ab dem achten Kopf", () => {
    expect(validateSchedule(viele(7, "MINIJOB"), [], YEAR).errors.filter((e) =>
      e.message.includes("Quá số nhân viên"),
    )).toEqual([]);

    const zuViele = validateSchedule(viele(8, "MINIJOB"), [], YEAR);
    expect(zuViele.errors.some((e) => e.message.includes("Quá số nhân viên: 8"))).toBe(true);
  });

  it("stört sich nicht an der Verteilung der Anstellungsarten", () => {
    // Sieben Vollzeitkräfte wären früher an der Stamm-Grenze von 3 gescheitert.
    const nurVollzeit = validateSchedule(viele(7, "VOLLZEIT"), [], YEAR);
    expect(nurVollzeit.errors.filter((e) => e.message.includes("Quá số"))).toEqual([]);
  });
});

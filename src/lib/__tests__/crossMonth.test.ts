// ============================================================================
// Wochen über die Monatsgrenze. Die Woche 26.01.–01.02.2026 gehört sechs Tage
// zum Januar und mit dem Sonntag zum Februar. Geplant wird Monat für Monat;
// ohne Vorlauf sah der Februar nur seinen Sonntag und gab zwei Minijob-Kräften
// dort 7 bzw. 8 h – bei 8 bzw. 7 h am Freitag/Samstag davor. Ergebnis: 15 h in
// einer Woche, erlaubt sind 10 (12 im Nachschlag).
//
// Die Belegschaft ist die echte von Januar/Februar 2026.
// ============================================================================

import { describe, expect, it } from "vitest";
import { generateSchedule } from "../scheduler";
import { validateSchedule } from "../validation";
import { carryOverFor, weekStartOf } from "../weeks";
import { maxConsecutiveRun } from "../consecutive";
import { DEFAULT_WORK_HOURS, type WorkHoursConfig } from "../workHours";
import { MINIJOB_FLEX_WEEKLY_HOURS, type Employee, type Shift } from "../../types";

const H = (h: number) => h * 60;
const team: Employee[] = [
  { id: "cham", name: "Châm", employmentType: "VOLLZEIT", targetMinutes: H(162), maxDaysPerWeek: 5 },
  { id: "hanh", name: "Hạnh", employmentType: "VOLLZEIT", targetMinutes: H(173), maxDaysPerWeek: 6 },
  { id: "toan", name: "Toàn", employmentType: "MINIJOB", targetMinutes: H(43), availableWeekdays: ["friday", "sunday"], maxDaysPerWeek: 2 },
  { id: "ve", name: "Vẻ", employmentType: "MINIJOB", targetMinutes: H(43), availableWeekdays: ["saturday", "sunday"], maxDaysPerWeek: 2 },
  { id: "safet", name: "Safet", employmentType: "MINIJOB", targetMinutes: H(43), maxDaysPerWeek: 2 },
];
// Wie im Betrieb: Sa/So erst ab 12:30.
const workHours: WorkHoursConfig = {
  ...DEFAULT_WORK_HOURS,
  perWeekday: {
    ...DEFAULT_WORK_HOURS.perWeekday,
    saturday: { startMinutes: 750, endMinutes: 1320 },
    sunday: { startMinutes: 750, endMinutes: 1320 },
  },
  holiday: { startMinutes: 750, endMinutes: 1320 },
};

// Wie im Betrieb eingetragen: Neujahr nur abends geöffnet.
const overrides = {
  "2026-01-01": { date: "2026-01-01", closed: false, window: { startMinutes: 1020, endMinutes: 1260 } },
};

const plan = (month: number, priorShifts?: Shift[]) =>
  generateSchedule({ year: 2026, month, workHours, overrides, employees: team, priorShifts });

/** Größte Wochensumme (h) je Minijob über Vorlauf + Monat, nur Wochen des Monats. */
function maxMinijobWeek(prior: Shift[], month: Shift[]): number {
  let max = 0;
  for (const e of team.filter((x) => x.employmentType === "MINIJOB")) {
    const own = month.filter((s) => s.employeeId === e.id);
    const weeks = new Set(own.map((s) => weekStartOf(s.date)));
    for (const wk of weeks) {
      const sum = [...prior, ...own]
        .filter((s) => s.employeeId === e.id && weekStartOf(s.date) === wk)
        .reduce((a, s) => a + s.paidMinutes, 0);
      max = Math.max(max, sum / 60);
    }
  }
  return max;
}

describe("Woche über die Monatsgrenze (Januar → Februar 2026)", () => {
  const jan = plan(1);
  const prior = carryOverFor(jan, 2026, 2);

  it("der Vorlauf sind genau die sechs Tage vor dem 1. Februar", () => {
    expect(prior.length).toBeGreaterThan(0);
    expect(prior.every((s) => s.date >= "2026-01-26" && s.date <= "2026-01-31")).toBe(true);
  });

  it("ohne Vorlauf reißt der Februar den Minijob-Wochendeckel (der alte Fehler)", () => {
    expect(maxMinijobWeek(prior, plan(2))).toBeGreaterThan(MINIJOB_FLEX_WEEKLY_HOURS);
  });

  it("mit Vorlauf hält jede Woche den Deckel – und jedes Soll bleibt exakt", () => {
    const feb = plan(2, prior);
    expect(maxMinijobWeek(prior, feb)).toBeLessThanOrEqual(MINIJOB_FLEX_WEEKLY_HOURS);

    for (const e of team) {
      const own = feb.filter((s) => s.employeeId === e.id);
      expect(`${e.name}: ${own.reduce((a, s) => a + s.paidMinutes, 0)}`).toBe(`${e.name}: ${e.targetMinutes}`);
      const dates = [...prior, ...own].filter((s) => s.employeeId === e.id).map((s) => s.date);
      expect(maxConsecutiveRun(dates)).toBeLessThanOrEqual(6);
    }
    // Vorlauf wird nicht mit zurückgegeben.
    expect(feb.every((s) => s.date >= "2026-02-01")).toBe(true);
  });

  it("die Prüfung meldet den Verstoß, wenn sie den Vorlauf kennt", () => {
    const ohne = plan(2);
    const meldungen = validateSchedule(team, ohne, 2026, prior).errors.map((e) => e.message);
    expect(meldungen.some((m) => m.includes("tuần từ 26.01."))).toBe(true);
    const mit = plan(2, prior);
    expect(
      validateSchedule(team, mit, 2026, prior).errors.some((e) => e.message.includes("tuần từ")),
    ).toBe(false);
  });
});

describe("Kein offener Tag ohne Besetzung (März 2026, vier Leute)", () => {
  // Im März fehlt Safet: Di–Do stehen nur die zwei Vollzeitkräfte zur
  // Verfügung. Früher blieb dort ein Tag mit EINER Person (14:30–22:00) übrig
  // – der Laden stand von 11:30 bis 14:30 leer. Geprüft wird minutengenau.
  const maerzTeam = team.filter((e) => e.id !== "safet");

  for (const [label, prior] of [
    ["ohne Vorlauf", [] as Shift[]],
    ["mit Vorlauf aus dem Februar", carryOverFor(plan(2, carryOverFor(plan(1), 2026, 2)), 2026, 3)],
  ] as const) {
    it(label, () => {
      const shifts = generateSchedule({ year: 2026, month: 3, workHours, overrides, employees: maerzTeam, priorShifts: prior });
      const leer: string[] = [];
      for (let tag = 1; tag <= 31; tag++) {
        const d = `2026-03-${String(tag).padStart(2, "0")}`;
        const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
        if (wd === 1) continue; // Montag Ruhetag
        const [von, bis] = wd === 0 || wd === 6 ? [750, 1320] : [690, 1320];
        const day = shifts.filter((s) => s.date === d);
        for (let t = von; t < bis; t++) {
          if (!day.some((s) => s.startMinutes <= t && s.endMinutes > t)) {
            leer.push(`${d} ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
            break;
          }
        }
      }
      expect(leer).toEqual([]);
      for (const e of maerzTeam) {
        const sum = shifts.filter((s) => s.employeeId === e.id).reduce((a, s) => a + s.paidMinutes, 0);
        expect(`${e.name}: ${sum}`).toBe(`${e.name}: ${e.targetMinutes}`);
      }
    });
  }
});

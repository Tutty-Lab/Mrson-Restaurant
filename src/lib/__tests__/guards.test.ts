// ============================================================================
// Unterbesetzung muss sichtbar werden statt still zu passieren.
//
// Mrson: Di–So 11:30–22:00 durchgehend; Fr/Sa/So abends (18:00–21:00)
// mindestens 2 Leute, bis 22:00 bleibt immer mindestens eine Person.
// ============================================================================

import { describe, expect, it } from "vitest";
import { analyzeSchedule } from "../analyze";
import { DEFAULT_WORK_HOURS } from "../workHours";
import type { Employee, Shift } from "../../types";

const emp = (id: string): Employee => ({ id, name: id, employmentType: "TEILZEIT", targetMinutes: 60 * 60 });

const dienst = (id: string, date: string, from: number, to: number): Shift => ({
  id: `shift-${id}-${date}-${from}`,
  employeeId: id,
  date,
  startMinutes: from,
  endMinutes: to,
  pauseMinutes: 0,
  paidMinutes: to - from,
  shiftType: from >= 17 * 60 ? "LATE" : "EARLY",
  generated: true,
});

const peaksOf = (employees: Employee[], shifts: Shift[], date: string) =>
  analyzeSchedule({ year: 2026, month: 8, workHours: DEFAULT_WORK_HOURS, employees, shifts })
    .peakViolations.find((d) => d.date === date)?.peaks ?? [];

describe("Mrson – Besetzung", () => {
  // 2026-08-04 Dienstag, 2026-08-07 Freitag.
  it("Dienstag: eine Person abends reicht", () => {
    const shifts = [dienst("a", "2026-08-04", 11 * 60 + 30, 17 * 60), dienst("b", "2026-08-04", 17 * 60, 22 * 60)];
    expect(peaksOf([emp("a"), emp("b")], shifts, "2026-08-04").filter((p) => !p.ok)).toEqual([]);
  });

  it("Freitagabend mit einer Person wird gemeldet (2 gefordert)", () => {
    const shifts = [dienst("a", "2026-08-07", 11 * 60 + 30, 17 * 60), dienst("b", "2026-08-07", 17 * 60, 22 * 60)];
    const tot = peaksOf([emp("a"), emp("b")], shifts, "2026-08-07").find((p) => !p.ok && p.label === "Tối");
    expect(tot?.minStaff).toBe(1);
    expect(tot?.required).toBe(2);
  });

  it("meldet, wenn bis 22:00 niemand mehr da ist", () => {
    const shifts = [dienst("a", "2026-08-04", 11 * 60 + 30, 19 * 60), dienst("b", "2026-08-04", 17 * 60, 21 * 60)];
    expect(peaksOf([emp("a"), emp("b")], shifts, "2026-08-04").some((p) => !p.ok && p.label === "Đóng cửa")).toBe(true);
  });
});

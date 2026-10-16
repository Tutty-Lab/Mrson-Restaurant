// ============================================================================
// Beispieldaten von Mrson Restaurant (Hürth). Monatsstunden, nicht je Woche.
// ============================================================================

import type { Employee, Schedule } from "../types";
import { DEFAULT_WORK_HOURS } from "./workHours";

export function makeEmployee(
  id: string,
  name: string,
  employmentType: Employee["employmentType"],
  targetHours: number,
): Employee {
  return { id, name, employmentType, targetMinutes: Math.round(targetHours * 60) };
}

/** Mitarbeiter mit WOCHENvertrag (hier nicht im Einsatz, bleibt für die Oberfläche). */
export function makeWeekly(
  id: string,
  name: string,
  employmentType: Employee["employmentType"],
  weeklyHours: number,
): Employee {
  return { id, name, employmentType, targetMinutes: 0, weeklyHours };
}

/**
 * Kunden-Demo („Demo Restaurant"): 10 erfundene Personen – 5 Vollzeit, 3 Teilzeit,
 * 2 Minijob, 6 Bồi und 4 Bếp (1.196 h im Monat).
 */
/**
 * Startbelegschaft wie in der alten App: höchstens 7 Leute. MJ1 arbeitet fest
 * Freitag und Sonntag. Die Minijob-Stunden liegen bewusst unter 43 h, damit
 * das Soll auch in Monaten mit Feiertagen aufgeht.
 */
export function mrsonEmployees(): Employee[] {
  return [
    makeEmployee("ST1", "ST1", "VOLLZEIT", 173),
    makeEmployee("ST2", "ST2", "VOLLZEIT", 195),
    makeEmployee("ST3", "ST3", "TEILZEIT", 120),
    { ...makeEmployee("MJ1", "MJ1", "MINIJOB", 30), availableWeekdays: ["friday", "sunday"] },
    makeEmployee("MJ2", "MJ2", "MINIJOB", 34),
    makeEmployee("MJ3", "MJ3", "MINIJOB", 34),
    makeEmployee("MJ4", "MJ4", "MINIJOB", 31),
  ];
}

/** Belegschaft der Standard-Filiale – für Tests und Altaufrufe. */
export const SAMPLE_EMPLOYEES: Employee[] = mrsonEmployees();

export function createSampleSchedule(): Schedule {
  return {
    companyName: "Mrson Restaurant",
    address: "Luxemburger Straße 332, 50354 Hürth",
    year: 2026,
    month: 8, // August
    workHours: structuredClone(DEFAULT_WORK_HOURS),
    dateOverrides: [],
    employees: mrsonEmployees(),
    shifts: [],
  };
}

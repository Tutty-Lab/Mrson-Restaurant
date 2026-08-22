// ============================================================================
// Beispieldaten laut Spezifikation: August 2026, Summe = 1022 bezahlte Stunden.
// ============================================================================

import type { Employee, Schedule } from "../types";
import { DEFAULT_WORK_HOURS } from "./workHours";

export function makeEmployee(
  id: string,
  name: string,
  employmentType: Employee["employmentType"],
  targetHours: number,
): Employee {
  return { id, name, employmentType, targetMinutes: targetHours * 60 };
}

/**
 * Beispielbelegschaft in der Struktur, die der Betrieb vorgibt:
 * höchstens 3 Stammkräfte + 5 Minijobs. Summe = 717 h.
 */
export const SAMPLE_EMPLOYEES: Employee[] = [
  makeEmployee("ST1", "ST1", "VOLLZEIT", 173),
  makeEmployee("ST2", "ST2", "VOLLZEIT", 195),
  makeEmployee("ST3", "ST3", "TEILZEIT", 120),
  // Diese Kraft arbeitet fest Freitag und Sonntag – zwei Tage, also zwei
  // Dienste in der Woche.
  { ...makeEmployee("MJ1", "MJ1", "MINIJOB", 30), availableWeekdays: ["friday", "sunday"] },
  // Diese Zahlen liegen bewusst unter dem rechnerischen Höchstwert von 43 h
  // (10 h x 52/12). Der Wochendeckel macht das Monats-Soll empfindlich gegen
  // angebrochene Wochen und geschlossene Tage: im Dezember mit den Feiertagen
  // sind keine 39 h mehr unterzubringen. Die Beispieldaten müssen in JEDEM
  // Monat aufgehen, deshalb hier der vorsichtige Wert.
  makeEmployee("MJ2", "MJ2", "MINIJOB", 34),
  makeEmployee("MJ3", "MJ3", "MINIJOB", 34),
  makeEmployee("MJ4", "MJ4", "MINIJOB", 31),
];

export function createSampleSchedule(): Schedule {
  return {
    companyName: "Mrson Restaurant",
    address: "Luxemburger Straße 332, 50354 Hürth",
    year: 2026,
    month: 8, // August
    workHours: structuredClone(DEFAULT_WORK_HOURS),
    dateOverrides: [],
    employees: SAMPLE_EMPLOYEES.map((e) => ({ ...e })),
    shifts: [],
  };
}

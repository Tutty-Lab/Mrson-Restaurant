// ============================================================================
// Test-Belegschaften für drei Monate.
//
// Angaben des Chefs (Mrson Restaurant):
//   - 2 Vollzeit: eine mit 39,9 h/Woche, eine mit 45 h/Woche, 5 Tage/Woche
//   - 4 Minijob: rund 10 h/Woche, teils 8 h, teils 9 h
//   - eine Minijob-Kraft ist fest auf Freitag und Sonntag gesetzt
//
// Wochenstunden -> Monatssoll mit 52/12 = 4,333 Wochen je Monat gerechnet und
// auf ganze Stunden gerundet, weil das Datenmodell nur ganze Stunden kennt:
//   39,9 h/Woche -> 173 h    45 h/Woche -> 195 h
//   10  h/Woche  ->  43 h     9 h/Woche ->  39 h     8 h/Woche -> 35 h
//
// Hinweis zum Datenmodell: Schedule hält immer GENAU EINEN Monat. Diese drei
// Monate existieren nebeneinander nur hier als Fixture.
// ============================================================================

import type { Employee, Schedule } from "../types";
import { COMPANY_ADDRESS, COMPANY_NAME } from "./company";
import type { WeekdayKey } from "./demand";
import { makeEmployee } from "./sampleData";
import { DEFAULT_WORK_HOURS } from "./workHours";

export type SeedMonth = {
  year: number;
  month: number; // 1-basiert
  label: string;
  employees: Employee[];
  /**
   * Wie viele Tage dürfen die Stoßzeit verfehlen? Normalfall 0.
   *
   * Bewusst hier sichtbar statt in der Prüfung versteckt: der Scheduler ist
   * eine Heuristik, keine vollständige Suche. Ein Wert > 0 heißt, dass die
   * Stundensumme rechnerisch reichen würde, der greedy Lauf die Verteilung
   * aber nicht findet – eine bekannte Schwäche, kein akzeptierter Zustand.
   */
  maxPeakGaps?: number;
};

/**
 * Die Minijob-Kraft, die laut Betrieb fest am Freitag und Sonntag arbeitet.
 *
 * Zwei Arbeitstage in der Woche heißen zwei Dienste – bei höchstens 10 Stunden
 * je Woche also rund 5 Stunden je Dienst. Über den Monat sind das etwa 35 h;
 * mehr geht nicht, weil angebrochene Wochen am Monatsrand oft nur einen der
 * beiden Tage enthalten.
 */
/**
 * Alle Wochentage außer einem – für Kräfte mit festem freien Tag.
 *
 * Wie viel Luft dafür ist, entscheidet das Monats-Soll, nicht der Wunsch:
 * bei höchstens 9 bezahlten Stunden am Tag braucht
 *   120 h -> 14 Arbeitstage,  173 h -> 20,  195 h -> 22.
 * Der Laden hat montags zu, im Juni bleiben also 25 offene Tage. 195 h lassen
 * damit höchstens DREI freie Tage im ganzen Monat übrig – ein fester freier
 * Wochentag kostet vier bis fünf und geht schlicht nicht auf. Deshalb hat hier
 * nur die 173-h- und die 120-h-Kraft einen.
 */
const ohne = (frei: WeekdayKey): WeekdayKey[] =>
  (["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as WeekdayKey[])
    .filter((k) => k !== frei);

const MINI_FR_SO = {
  ...makeEmployee("mini-1", "Mini 1 (Fr + CN)", "MINIJOB", 35),
  availableWeekdays: ["friday", "sunday"] as WeekdayKey[],
};

/** Juni 2026 – volle Besetzung: 3 Stammkräfte + 4 Minijobs = 7 Personen. */
const JUNE_2026: Employee[] = [
  // Fester freier Tag zusätzlich zum Ruhetag des Ladens.
  { ...makeEmployee("st-1", "Stamm 1", "VOLLZEIT", 173), availableWeekdays: ohne("tuesday") },
  makeEmployee("st-2", "Stamm 2", "VOLLZEIT", 195),
  { ...makeEmployee("st-3", "Stamm 3", "TEILZEIT", 120), availableWeekdays: ohne("thursday") },
  { ...MINI_FR_SO },
  // 43 h wären der rechnerische Höchstwert (10 h x 52/12), praktisch aber
  // nicht erreichbar: dafür müsste jede Woche des Monats voll ausgeschöpft
  // werden, auch die angebrochenen am Rand.
  makeEmployee("mini-2", "Mini 2", "MINIJOB", 39),
  makeEmployee("mini-3", "Mini 3", "MINIJOB", 39),
  makeEmployee("mini-4", "Mini 4", "MINIJOB", 35),
];

/** Juli 2026 – zwei Minijob-Kräfte im Urlaub. */
const JULY_2026: Employee[] = [
  // Fester freier Tag zusätzlich zum Ruhetag des Ladens.
  { ...makeEmployee("st-1", "Stamm 1", "VOLLZEIT", 173), availableWeekdays: ohne("tuesday") },
  makeEmployee("st-2", "Stamm 2", "VOLLZEIT", 195),
  { ...makeEmployee("st-3", "Stamm 3", "TEILZEIT", 120), availableWeekdays: ohne("thursday") },
  { ...MINI_FR_SO },
  // 43 h wären der rechnerische Höchstwert (10 h x 52/12), praktisch aber
  // nicht erreichbar: dafür müsste jede Woche des Monats voll ausgeschöpft
  // werden, auch die angebrochenen am Rand.
  makeEmployee("mini-2", "Mini 2", "MINIJOB", 39),
];

/** August 2026 – Teilzeit aufgestockt, sonst wie Juni. */
const AUGUST_2026: Employee[] = [
  // Fester freier Tag zusätzlich zum Ruhetag des Ladens.
  { ...makeEmployee("st-1", "Stamm 1", "VOLLZEIT", 173), availableWeekdays: ohne("tuesday") },
  makeEmployee("st-2", "Stamm 2", "VOLLZEIT", 195),
  { ...makeEmployee("st-3", "Stamm 3", "TEILZEIT", 130), availableWeekdays: ohne("thursday") },
  { ...MINI_FR_SO },
  // 43 h wären der rechnerische Höchstwert (10 h x 52/12), praktisch aber
  // nicht erreichbar: dafür müsste jede Woche des Monats voll ausgeschöpft
  // werden, auch die angebrochenen am Rand.
  makeEmployee("mini-2", "Mini 2", "MINIJOB", 39),
  makeEmployee("mini-3", "Mini 3", "MINIJOB", 39),
  makeEmployee("mini-4", "Mini 4", "MINIJOB", 35),
];

export const SEED_MONTHS: SeedMonth[] = [
  { year: 2026, month: 6, label: "Juni 2026", employees: JUNE_2026 },
  { year: 2026, month: 7, label: "Juli 2026", employees: JULY_2026 },
  { year: 2026, month: 8, label: "August 2026", employees: AUGUST_2026 },
];

/** Baut einen leeren Schedule (ohne Schichten) für einen Seed-Monat. */
export function scheduleForSeed(seed: SeedMonth): Schedule {
  return {
    companyName: COMPANY_NAME,
    address: COMPANY_ADDRESS,
    year: seed.year,
    month: seed.month,
    workHours: structuredClone(DEFAULT_WORK_HOURS),
    dateOverrides: [],
    employees: seed.employees.map((e) => ({ ...e })),
    shifts: [],
  };
}

/** Summe der Sollstunden eines Seed-Monats (für Kapazitäts-Checks). */
export function totalTargetHours(seed: SeedMonth): number {
  return seed.employees.reduce((sum, e) => sum + e.targetMinutes, 0) / 60;
}

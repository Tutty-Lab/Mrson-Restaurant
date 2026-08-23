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
 * Die Belegschaft, wie der Betrieb sie genannt hat.
 *
 *   Phương Toàn Nguyễn   Minijob 43 h   Sonntag + Freitag
 *   Hoàng Thị Vẻ         Minijob 43 h   Sonntag + Samstagabend
 *   Nguyễn Đắc Long      Minijob 43 h   nur Sonntag
 *   Xuân Thanh Bùi       Minijob 43 h   nur Sonntag
 *   Hà Thị Chăm          Vollzeit 172,7 h   5 Tage die Woche
 *   Phạm Minh Hạnh       Vollzeit 194 h     6 Tage die Woche
 *
 * ZWEI ANMERKUNGEN, die der Betrieb kennen sollte:
 *
 * 1. "Nur Sonntag" und 43 h im Monat gehen nicht zusammen. Bei höchstens
 *    9 Stunden am Tag sind vier Sonntage 36 h – im Juni und Juli 2026 gibt es
 *    genau vier. Nur ein Monat mit fünf Sonntagen (45 h) trägt die 43 h.
 *    Die Zahlen stehen hier trotzdem so, wie sie genannt wurden; der Plan
 *    meldet dann, wie viel wirklich untergebracht wurde.
 *
 * 2. "Samstagabend" ist im Datenmodell nicht abbildbar – availableWeekdays
 *    kennt nur ganze Wochentage, keine Tageszeiten. Hier steht deshalb der
 *    ganze Samstag. Ob daraus ein Abenddienst wird, entscheidet die
 *    Spätschicht-Quote, nicht eine feste Regel.
 */
const BELEGSCHAFT: Employee[] = [
  {
    ...makeEmployee("mj-toan", "Phương Toàn Nguyễn", "MINIJOB", 43),
    availableWeekdays: ["friday", "sunday"] as WeekdayKey[],
  },
  {
    ...makeEmployee("mj-ve", "Hoàng Thị Vẻ", "MINIJOB", 43),
    availableWeekdays: ["saturday", "sunday"] as WeekdayKey[],
  },
  {
    ...makeEmployee("mj-long", "Nguyễn Đắc Long", "MINIJOB", 43),
    availableWeekdays: ["sunday"] as WeekdayKey[],
  },
  {
    ...makeEmployee("mj-bui", "Xuân Thanh Bùi", "MINIJOB", 43),
    availableWeekdays: ["sunday"] as WeekdayKey[],
  },
  // Der Betrieb nennt 172,7 h. Hier stehen 173.
  //
  // Der Plan besteht aus Schichten in GANZEN Stunden, und aus ganzen Stunden
  // lassen sich keine 0,7 zusammensetzen – mit 172,7 h fand der Scheduler gar
  // keine Aufteilung und die Kraft bekam null Dienste. Die 0,3 h Differenz
  // gleicht der Betrieb ohnehin beim Lohn aus; die App warnt außerdem, sobald
  // ein Soll keine ganze Stunde ist.
  { ...makeEmployee("vz-cham", "Hà Thị Chăm", "VOLLZEIT", 173), maxDaysPerWeek: 5 },
  { ...makeEmployee("vz-hanh", "Phạm Minh Hạnh", "VOLLZEIT", 194), maxDaysPerWeek: 6 },
];

const kopie = (): Employee[] => BELEGSCHAFT.map((e) => ({ ...e }));

/**
 * Drei Monate mit FÜNF Sonntagen.
 *
 * Das ist keine Bequemlichkeit, sondern die Bedingung, unter der diese
 * Belegschaft überhaupt aufgeht: vier der sechs Kräfte arbeiten nur sonntags
 * (zwei davon ausschließlich). Bei höchstens 9 Stunden am Tag bringt ein
 * Sonntag 9 h, vier Sonntage also 36 h – 43 h im Monat sind damit
 * unerreichbar. Erst der fünfte Sonntag (45 h) trägt das Soll.
 *
 * Ein Monat mit vier Sonntagen ist der Normalfall, nicht die Ausnahme; dass
 * die Belegschaft dort nicht aufgeht, hält der Test "vier Sonntage reichen
 * nicht" ausdrücklich fest, statt es hinter passend gewählten Monaten zu
 * verstecken.
 */
export const SEED_MONTHS: SeedMonth[] = [
  { year: 2026, month: 8, label: "August 2026", employees: kopie() },
  { year: 2026, month: 11, label: "November 2026", employees: kopie() },
  { year: 2027, month: 1, label: "Januar 2027", employees: kopie() },
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

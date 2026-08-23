import type { WeekdayKey } from "./lib/demand";

// ============================================================================
// Zentrale Datentypen. Intern wird IMMER in Minuten (Integer) gerechnet,
// niemals mit Fließkomma-Stunden.
// ============================================================================

import type { DateOverride, WorkHoursConfig } from "./lib/workHours";

/**
 * Anstellungsart. MINIJOB ist arbeitsrechtlich eine Form der Teilzeit und wird
 * bei der Schichtplanung auch genauso behandelt – die Trennung dient der
 * Obergrenze und der Belegschaftsstruktur, nicht der Planung selbst.
 */
export type EmploymentType = "VOLLZEIT" | "TEILZEIT" | "MINIJOB";

/**
 * Minijob: höchstens 10 Stunden pro Woche – so die Angabe des Betriebs.
 *
 * Die Woche ist die harte Grenze und wird beim Planen Woche für Woche
 * eingehalten. Der Monatswert daneben ist nur die Umrechnung fürs Soll:
 * 10 h x 52/12 Wochen = 43 h im Monat.
 */
/**
 * Höchstzahl der Beschäftigten – gezählt wird die GESAMTE Belegschaft.
 *
 * Früher standen hier zwei getrennte Zahlen (höchstens 3 Stammkräfte und 5
 * Minijobs). Der Betrieb hat das später auf eine einzige Obergrenze
 * zusammengezogen: wie sich die sieben Leute auf Vollzeit, Teilzeit und
 * Minijob verteilen, ist seine Sache und keine Regel der App.
 *
 * Angabe des Betriebs, keine Rechtsvorschrift – deshalb eine Warnung und kein
 * harter Riegel.
 */
export const MAX_EMPLOYEES = 7;

export const MINIJOB_MAX_WEEKLY_HOURS = 10;
export const MINIJOB_MAX_MONTHLY_HOURS = Math.floor((MINIJOB_MAX_WEEKLY_HOURS * 52) / 12);

/**
 * Jahresurlaub in ARBEITSTAGEN, nicht in Stunden.
 *
 * So rechnet das Bundesurlaubsgesetz: der Anspruch hängt daran, an wie vielen
 * Tagen die Woche jemand arbeitet, nicht wie lange. Wer nur eine Stunde
 * kommt, hat trotzdem einen ganzen Arbeitstag verbraucht. Bei fünf Tagen die
 * Woche sind es 20 Tage im Jahr, bei sechs Tagen 24.
 *
 * Der Betrieb gibt für die Stammkräfte 24 vor (also die Sechs-Tage-Woche) und
 * für Minijob 8. Wird das überschritten, warnt die App – sie hindert aber
 * niemanden: mehr Urlaub als der gesetzliche Mindestanspruch ist erlaubt, er
 * kann vertraglich vereinbart oder aus dem Vorjahr übertragen sein.
 */
export const URLAUB_DAYS_PER_YEAR: Record<EmploymentType, number> = {
  VOLLZEIT: 24,
  TEILZEIT: 24,
  MINIJOB: 8,
};

export type ShiftType = "EARLY" | "LATE" | "CUSTOM";

export type Employee = {
  id: string;
  name: string;
  employmentType: EmploymentType;
  /** Monatliches Soll in Minuten (Integer). 176 h => 10560. */
  targetMinutes: number;
  /**
   * Wochentage, an denen diese Person überhaupt eingeplant werden darf.
   *
   * Fehlt das Feld oder ist es leer, gilt: jeder Tag ist möglich. Damit deckt
   * EIN Feld beide Wünsche des Betriebs ab – "die Minijob-Kraft arbeitet fest
   * Freitag und Sonntag" (nur diese beiden ankreuzen) und "die Vollzeitkraft
   * hat montags frei" (Montag abwählen).
   */
  availableWeekdays?: WeekdayKey[];
  /**
   * Urlaubstage als ISO-Daten "yyyy-MM-dd", über das GANZE Jahr.
   *
   * Bewusst das ganze Jahr und nicht nur der geplante Monat: der Anspruch ist
   * ein Jahresanspruch, und ob jemand seine 24 Tage überschreitet, lässt sich
   * nur am Jahr ablesen. Der Scheduler nimmt sich daraus die Tage des Monats,
   * den er gerade plant.
   *
   * Die Tage trägt IMMER der Nutzer ein. Der Automat darf keinen Urlaub
   * verteilen – wer wann frei nimmt, ist eine Absprache im Betrieb.
   */
  vacationDates?: string[];
};

export type Shift = {
  id: string;
  employeeId: string;
  /** ISO-Datum "yyyy-MM-dd". */
  date: string;
  startMinutes: number;
  endMinutes: number;
  pauseMinutes: number;
  /** Bezahlte Arbeitszeit in Minuten = presence - pause. */
  paidMinutes: number;
  shiftType: ShiftType;
  /** true = automatisch generiert, false = manuell hinzugefügt/geändert. */
  generated: boolean;
};

export type Schedule = {
  companyName: string;
  /** Anschrift des Betriebs (erscheint auf dem Stundenzettel). */
  address: string;
  year: number;
  /** 1-basiert: 1 = Januar ... 12 = Dezember. */
  month: number;
  /** Arbeitszeit-Fenster (giờ làm) je Wochentag + Feiertag. */
  workHours: WorkHoursConfig;
  /** Ausnahmen für einzelne Daten (geschlossen / abweichende Zeiten). */
  dateOverrides: DateOverride[];
  employees: Employee[];
  shifts: Shift[];
  /**
   * Zeitpunkt der ersten Wochen-Ausgabe (ISO). Gesetzt = der Monat ist
   * gesperrt und darf nicht mehr geändert werden.
   *
   * Hintergrund: sobald eine Woche ausgedruckt im Laden hängt, muss der Stand
   * im System exakt dem Papier entsprechen – bei einer Kontrolle wird genau
   * das verglichen. Entsperren geht nur bewusst über die Oberfläche.
   */
  lockedAt?: string;
  /** Bereits gedruckte Wochen, als ISO-Datum des jeweiligen Montags. */
  printedWeeks?: string[];
};

/** Ein einzelnes zu verplanendes Schicht-Token (Ergebnis von splitTargetHours). */
export type ShiftToken = {
  employeeId: string;
  paidMinutes: number;
};

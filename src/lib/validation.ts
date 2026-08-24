// ============================================================================
// Validierung des Dienstplans gegen alle geforderten Regeln.
// ============================================================================

import { vacationDaysInYear, vacationEntitlement } from "./availability";
import {
  MAX_EMPLOYEES,
  MINIJOB_MAX_MONTHLY_HOURS,
  MINIJOB_MAX_WEEKLY_HOURS,
  type Employee,
  type Shift,
} from "../types";
import { calculatePause } from "./time";
import { maxConsecutiveRun } from "./consecutive";

export type ValidationError = {
  employeeId?: string;
  date?: string;
  message: string;
  /**
   * "error" = der Plan ist unzulässig und muss korrigiert werden.
   * "warning" = der Plan ist benutzbar, etwas passt nur nicht ideal.
   *
   * Ein zu hohes Monats-Soll ist eine WARNUNG: der Plan bleibt gültig, es
   * fehlen nur Stunden, die der Monat gar nicht hergibt. Das als Fehler zu
   * führen hieße, dem Betrieb einen brauchbaren Plan vorzuenthalten, weil eine
   * Zahl in der Mitarbeiterliste zu groß ist.
   */
  severity?: "error" | "warning";
};

export type EmployeeSummary = {
  employee: Employee;
  assignedMinutes: number;
  targetMinutes: number;
  diffMinutes: number; // assigned - target
  maxConsecutiveDays: number;
  shiftCount: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  summaries: EmployeeSummary[];
};

const MAX_PAID_MINUTES = 9 * 60;
const MAX_CONSECUTIVE_DAYS = 6;

export function validateSchedule(
  employees: Employee[],
  shifts: Shift[],
  /** Jahr des geplanten Monats – nötig für die Urlaubsprüfung. */
  year: number = new Date().getFullYear(),
): ValidationResult {
  const errors: ValidationError[] = [];

  // ── Vorgaben des Betriebs zur Belegschaft ─────────────────────────────────
  // Diese Regeln haengen nicht am Plan, sondern an der Mitarbeiterliste. Sie
  // stehen trotzdem hier, damit ein Verstoss nicht erst beim Lohnbuero auffaellt.
  // Obergrenze für die GESAMTE Belegschaft. Früher wurde getrennt gezählt
  // (höchstens 3 Stammkräfte, höchstens 5 Minijobs); der Betrieb hat das auf
  // eine einzige Zahl zusammengezogen. Wie sich die sieben Leute auf die
  // Anstellungsarten verteilen, ist seine Sache.
  if (employees.length > MAX_EMPLOYEES) {
    errors.push({
      message: `Quá số nhân viên: ${employees.length} người, tối đa ${MAX_EMPLOYEES}.`,
    });
  }

  // Ein Soll mit Nachkommastelle lässt sich nicht planen: die Schichten sind
  // ganze Stunden, und daraus entsteht nie eine halbe. Ohne diesen Hinweis
  // bekommt die Kraft schlicht null Dienste, und niemand sieht warum.
  for (const emp of employees) {
    if (emp.targetMinutes % 60 === 0) continue;
    errors.push({
      employeeId: emp.id,
      message:
        `${emp.name}: định mức ${(emp.targetMinutes / 60).toFixed(2)}h không phải số giờ chẵn. ` +
        `Ca chỉ tính theo giờ chẵn nên không xếp được — hãy làm tròn thành ` +
        `${Math.round(emp.targetMinutes / 60)}h.`,
    });
  }

  // Urlaub. Der Anspruch gilt fürs JAHR, geprüft wird deshalb gegen alle
  // eingetragenen Tage dieses Jahres – nicht nur gegen den geplanten Monat.
  // Es bleibt eine Warnung: mehr Urlaub als der gesetzliche Mindestanspruch
  // ist erlaubt, er kann vertraglich vereinbart oder übertragen sein.
  for (const emp of employees) {
    const anspruch = vacationEntitlement(emp);
    const genommen = vacationDaysInYear(emp, year);
    if (genommen > anspruch) {
      errors.push({
        employeeId: emp.id,
        message:
          `${emp.name}: đã nghỉ phép ${genommen} ngày trong năm ${year}, ` +
          `vượt ${anspruch} ngày theo quy định.`,
      });
    }
  }

  for (const emp of employees) {
    if (emp.employmentType !== "MINIJOB") continue;
    const hours = emp.targetMinutes / 60;
    if (hours > MINIJOB_MAX_MONTHLY_HOURS) {
      errors.push({
        employeeId: emp.id,
        message:
          `${emp.name}: Minijob ${hours}h/tháng vượt trần ${MINIJOB_MAX_MONTHLY_HOURS}h ` +
          `(${MINIJOB_MAX_WEEKLY_HOURS}h/tuần).`,
      });
    }
  }

  const shiftsByEmployee = new Map<string, Shift[]>();
  for (const emp of employees) shiftsByEmployee.set(emp.id, []);
  for (const shift of shifts) {
    if (!shiftsByEmployee.has(shift.employeeId)) {
      shiftsByEmployee.set(shift.employeeId, []);
    }
    shiftsByEmployee.get(shift.employeeId)!.push(shift);
  }

  // Regeln je einzelner Schicht.
  for (const shift of shifts) {
    const presence = shift.endMinutes - shift.startMinutes;
    const expectedPaid = presence - shift.pauseMinutes;
    const expectedPause = calculatePause(shift.paidMinutes);

    if (shift.endMinutes <= shift.startMinutes) {
      errors.push({
        employeeId: shift.employeeId,
        date: shift.date,
        message: `Giờ ra không sau giờ vào (${shift.date}).`,
      });
    }
    if (shift.paidMinutes > MAX_PAID_MINUTES) {
      errors.push({
        employeeId: shift.employeeId,
        date: shift.date,
        message: `Quá 9 giờ công ngày ${shift.date}.`,
      });
    }
    if (shift.paidMinutes !== expectedPaid) {
      errors.push({
        employeeId: shift.employeeId,
        date: shift.date,
        message: `Giờ công không khớp giờ vào/ra/nghỉ ngày ${shift.date}.`,
      });
    }
    if (shift.pauseMinutes !== expectedPause) {
      errors.push({
        employeeId: shift.employeeId,
        date: shift.date,
        message: `Sai giờ nghỉ ngày ${shift.date}: ${shift.pauseMinutes} thay vì ${expectedPause} phút.`,
      });
    }
  }

  const summaries: EmployeeSummary[] = [];

  for (const emp of employees) {
    const empShifts = shiftsByEmployee.get(emp.id) ?? [];

    // Höchstens ein Dienst pro Tag.
    const seenDates = new Set<string>();
    for (const shift of empShifts) {
      if (seenDates.has(shift.date)) {
        errors.push({
          employeeId: emp.id,
          date: shift.date,
          message: `Có nhiều hơn một ca ngày ${shift.date}.`,
        });
      }
      seenDates.add(shift.date);
    }

    const assignedMinutes = empShifts.reduce((sum, s) => sum + s.paidMinutes, 0);
    const maxRun = maxConsecutiveRun(empShifts.map((s) => s.date));

    if (assignedMinutes !== emp.targetMinutes) {
      const zuWenig = assignedMinutes < emp.targetMinutes;
      errors.push({
        employeeId: emp.id,
        // Zu WENIG verteilt heißt: der Monat gibt nicht mehr her – Warnung.
        // Zu VIEL wäre ein echter Fehler im Plan.
        severity: zuWenig ? "warning" : "error",
        message: zuWenig
          ? `${emp.name}: mới xếp được ${assignedMinutes / 60}h / ${emp.targetMinutes / 60}h — tháng này không đủ ngày cho định mức đó.`
          : `${emp.name}: xếp quá giờ định mức: ${assignedMinutes / 60} h thay vì ${emp.targetMinutes / 60} h.`,
      });
    }
    if (maxRun > MAX_CONSECUTIVE_DAYS) {
      errors.push({
        employeeId: emp.id,
        message: `${emp.name}: làm quá 6 ngày liên tiếp (${maxRun}).`,
      });
    }

    summaries.push({
      employee: emp,
      assignedMinutes,
      targetMinutes: emp.targetMinutes,
      diffMinutes: assignedMinutes - emp.targetMinutes,
      maxConsecutiveDays: maxRun,
      shiftCount: empShifts.length,
    });
  }

  // Warnungen machen den Plan nicht ungültig – sonst blockiert eine zu große
  // Zahl in der Mitarbeiterliste das Drucken eines sonst brauchbaren Plans.
  const echteFehler = errors.filter((e) => e.severity !== "warning");
  return { valid: echteFehler.length === 0, errors, summaries };
}

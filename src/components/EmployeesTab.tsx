import { useCallback, useMemo, useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Employee, EmploymentType } from "../types";
import { splitTargetHours } from "../lib/splitTargetHours";
import { VacationPicker } from "./VacationPicker";
import { isDayClosed } from "../lib/workHours";
import { publicHolidays } from "../lib/holidays";
import {
  WEEKDAY_SHORT_VI,
  type WeekdayKey,
} from "../lib/demand";
import {
  vacationDatesInMonth,
  vacationDaysInYear,
  vacationEntitlement,
} from "../lib/availability";

const WEEKDAY_ORDER: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const inputClass =
  "rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

/**
 * Ab hier wird gewarnt. 192 h = 24 Tage à 8 h; darüber wird der Monat sehr
 * eng (6-Tage-Regel) und arbeitsrechtlich heikel.
 */
export const WARN_HOURS = 192;

/** Số ngày làm (= số ca) cho một mục tiêu, hoặc thông báo lỗi. */
function splitInfo(targetHours: number, type: EmploymentType): { ok: boolean; text: string } {
  try {
    const parts = splitTargetHours(targetHours, type);
    return { ok: true, text: `${parts.length} ca` };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : "không hợp lệ" };
  }
}

export function EmployeesTab({ store }: { store: UseScheduleReturn }) {
  const { schedule, addEmployee, updateEmployee, removeEmployee } = store;
  // Geschlossene Tage sind im Urlaubskalender nicht wählbar: an einem Tag, an
  // dem der Laden ohnehin zu hat, verbraucht niemand einen Urlaubstag.
  const holidays = useMemo(() => publicHolidays(schedule.year), [schedule.year]);
  const overrides = useMemo(
    () => Object.fromEntries(schedule.dateOverrides.map((o) => [o.date, o])),
    [schedule.dateOverrides],
  );
  const isClosed = useCallback(
    (iso: string) => isDayClosed(schedule.workHours, iso, holidays, overrides),
    [schedule.workHours, holidays, overrides],
  );

  const [name, setName] = useState("");
  const [type, setType] = useState<EmploymentType>("VOLLZEIT");
  const [hours, setHours] = useState(176);

  return (
    <section className="rounded-lg bg-white border border-slate-200 p-4 sm:p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900 mb-4">Nhân viên</h2>

      {/* Thêm nhân viên mới */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 mb-5 rounded bg-slate-50 border border-slate-200 p-3">
        <label className="flex flex-col sm:flex-1 sm:min-w-[140px]">
          <span className="text-xs text-slate-600 mb-1">Tên</span>
          <input
            className={`${inputClass} w-full`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên nhân viên"
          />
        </label>
        <label className="flex flex-col sm:w-40">
          <span className="text-xs text-slate-600 mb-1">Hình thức làm việc</span>
          <select
            className={`${inputClass} w-full`}
            value={type}
            onChange={(e) => setType(e.target.value as EmploymentType)}
          >
            <option value="VOLLZEIT">Toàn thời gian</option>
            <option value="TEILZEIT">Bán thời gian</option>
                    <option value="MINIJOB">Minijob</option>
          </select>
        </label>
        <label className="flex flex-col sm:w-32">
          <span className="text-xs text-slate-600 mb-1">Giờ định mức</span>
          <input
            type="number"
            min={0}
            step={1}
            className={`${inputClass} w-full`}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() => {
            addEmployee(name, type, hours);
            setName("");
          }}
          className="rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800"
        >
          Thêm nhân viên
        </button>
      </div>

      {/* Danh sách – thẻ xếp dọc trên mobile, 1 dòng trên màn lớn (không cuộn ngang) */}
      {schedule.employees.length === 0 ? (
        <div className="py-6 text-center text-slate-400">
          Chưa có nhân viên. Thêm nhân viên ở khung phía trên.
        </div>
      ) : (
        <div className="space-y-2">
          {schedule.employees.map((emp) => {
            const info = splitInfo(emp.targetMinutes / 60, emp.employmentType);
            const tooMany = emp.targetMinutes / 60 > WARN_HOURS;
            return (
              <div key={emp.id} className="rounded-lg border border-slate-200 p-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <label className="flex flex-col sm:flex-1">
                  <span className="text-xs text-slate-500 mb-1 sm:hidden">Tên</span>
                  <input
                    className={`${inputClass} w-full`}
                    value={emp.name}
                    onChange={(e) => updateEmployee(emp.id, { name: e.target.value })}
                  />
                </label>
                <label className="flex flex-col sm:w-40">
                  <span className="text-xs text-slate-500 mb-1 sm:hidden">Hình thức</span>
                  <select
                    className={`${inputClass} w-full`}
                    value={emp.employmentType}
                    onChange={(e) =>
                      updateEmployee(emp.id, {
                        employmentType: e.target.value as EmploymentType,
                      })
                    }
                  >
                    <option value="VOLLZEIT">Toàn thời gian</option>
                    <option value="TEILZEIT">Bán thời gian</option>
                    <option value="MINIJOB">Minijob</option>
                  </select>
                </label>
                <label className="flex flex-col sm:w-32">
                  <span className="text-xs text-slate-500 mb-1 sm:hidden">Giờ định mức</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className={`${inputClass} w-full`}
                      value={emp.targetMinutes / 60}
                      onChange={(e) =>
                        updateEmployee(emp.id, {
                          targetMinutes: Math.max(0, Math.round(Number(e.target.value))) * 60,
                        })
                      }
                    />
                    <span className="text-slate-400">h</span>
                  </div>
                </label>

                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-end gap-1 sm:w-24">
                  <span className={`text-xs ${info.ok ? "text-slate-500" : "text-rose-600"}`}>
                    {info.text}
                  </span>
                  {tooMany && (
                    <span
                      className="text-xs text-amber-600 font-medium"
                      title={`Trên ${WARN_HOURS}h/tháng rất khó xếp (tối đa 6 ngày làm liên tiếp) và dễ vượt giới hạn giờ làm theo luật Đức.`}
                    >
                      ⚠ &gt;{WARN_HOURS}h
                    </span>
                  )}
                  <button
                    onClick={() => removeEmployee(emp.id)}
                    className="text-rose-600 hover:text-rose-800 text-sm font-medium"
                  >
                    Xoá
                  </button>
                </div>
                </div>

                <EmployeeRules
                  emp={emp}
                  year={schedule.year}
                  month={schedule.month}
                  updateEmployee={updateEmployee}
                  isClosed={isClosed}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Zweite Zeile je Mitarbeiter: feste Arbeitstage und Urlaub.
 *
 * Beides trägt der Betrieb selbst ein – der Automat entscheidet weder, wer
 * wann frei hat, noch wer an welchem Wochentag kommt. Er hält sich nur daran.
 */
function EmployeeRules({
  emp,
  year,
  month,
  updateEmployee,
  isClosed,
}: {
  emp: Employee;
  year: number;
  month: number;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  isClosed: (iso: string) => boolean;
}) {
  // Die Liste ist eingeklappt, solange niemand sie braucht. Sieben
  // Mitarbeiter mal einunddreißig Zeilen wären sonst eine sehr lange Seite.
  const [kalenderOffen, setKalenderOffen] = useState(false);

  const gewaehlt = emp.availableWeekdays ?? [];
  const alleTage = gewaehlt.length === 0;

  const toggleWeekday = (key: WeekdayKey) => {
    // Kein Häkchen gesetzt heißt "alle Tage möglich". Wer aus diesem Zustand
    // heraus einen Tag abwählt, meint "alle außer diesem" – deshalb wird die
    // Liste dann mit allen anderen Tagen vorbelegt und nicht mit einem
    // einzelnen. Andernfalls würde ein Klick die Person auf einen Tag
    // festnageln, was das Gegenteil der Absicht wäre.
    const basis = alleTage ? WEEKDAY_ORDER : gewaehlt;
    const naechste = basis.includes(key)
      ? basis.filter((k) => k !== key)
      : [...basis, key];
    updateEmployee(emp.id, {
      availableWeekdays: naechste.length === WEEKDAY_ORDER.length ? undefined : naechste,
    });
  };

  const urlaubJahr = vacationDaysInYear(emp, year);
  const anspruch = vacationEntitlement(emp);
  const imMonat = vacationDatesInMonth(emp, year, month);
  const zuViel = urlaubJahr > anspruch;

  const toggleUrlaub = (iso: string) => {
    const jetzt = emp.vacationDates ?? [];
    updateEmployee(emp.id, {
      vacationDates: jetzt.includes(iso)
        ? jetzt.filter((d) => d !== iso)
        : [...jetzt, iso].sort(),
    });
  };


  return (
    <div className="border-t border-slate-100 pt-3 grid gap-3 sm:grid-cols-2">
      <div>
        <div className="text-xs text-slate-600 mb-1.5">
          Ngày làm trong tuần
          {alleTage && <span className="text-slate-400"> — bỏ trống = làm mọi ngày</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {WEEKDAY_ORDER.map((key) => {
            const an = alleTage || gewaehlt.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleWeekday(key)}
                className={`rounded px-2 py-1 text-xs border transition-colors ${
                  an
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-400 border-slate-200 line-through"
                }`}
              >
                {WEEKDAY_SHORT_VI[key]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs text-slate-600 mb-1.5">
          Nghỉ phép (Urlaub){" "}
          <span className={zuViel ? "text-rose-600 font-medium" : "text-slate-400"}>
            — {urlaubJahr}/{anspruch} ngày trong năm {year}
            {zuViel && " ⚠ vượt quy định"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setKalenderOffen((o) => !o)}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          {kalenderOffen ? "Đóng danh sách" : "Chọn ngày nghỉ"}
          {imMonat.length > 0 && ` · ${imMonat.length} ngày trong tháng`}
        </button>

        {!kalenderOffen && imMonat.length > 0 && (
          <div className="mt-1 text-xs text-slate-500">
            {imMonat.map((iso) => `${Number(iso.slice(8))}.${iso.slice(5, 7)}`).join(", ")}
          </div>
        )}

        {kalenderOffen && (
          <div className="mt-2">
            <VacationPicker
              year={year}
              month={month}
              selected={emp.vacationDates ?? []}
              onToggle={toggleUrlaub}
              isClosed={isClosed}
            />
          </div>
        )}
      </div>
    </div>
  );
}

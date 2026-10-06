import { useMemo, useState } from "react";
import type { UseScheduleReturn } from "../hooks/useSchedule";
import type { Employee, Shift } from "../types";
import {
  vacationDatesInMonth,
  vacationDaysInYear,
  vacationEntitlement,
} from "../lib/availability";
import {
  datesOfMonth,
  parseIsoDate,
  WEEKDAY_SHORT_VI,
  weekdayKeyOf,
} from "../lib/demand";
import { minutesToShortHours, minutesToTime } from "../lib/time";
import { signedHours } from "../lib/dateFormat";
import { monthLabel } from "../lib/shiftOps";
import { isDayClosed } from "../lib/workHours";
import { publicHolidays } from "../lib/holidays";
import { VacationPicker } from "./VacationPicker";
import { ShiftCellEditor } from "./ShiftCellEditor";
import { ScheduleDayView } from "./ScheduleDayView";
import { weeksOfMonth } from "../lib/weeks";
import { employmentShortVi } from "../lib/employment";
import { buildDayDebug, buildEmployeeDebug, fullWeekLabel, SLOT_MINUTES, type DayDebug } from "../lib/debugStats";
import { MINIJOB_FLEX_WEEKLY_HOURS, MINIJOB_MAX_WEEKLY_HOURS } from "../types";

const DEBUG_KEY = "stundenzettel-app:debug";

/** Farbe eines Feldes im Besetzungsstreifen: 0 rot, 1 gelb, 2 hellgrün, 3+ grün. */
function slotColor(n: number): string {
  if (n <= 0) return "bg-rose-500";
  if (n === 1) return "bg-amber-300";
  if (n === 2) return "bg-emerald-300";
  return "bg-emerald-600";
}

/** Besetzungsstreifen eines Tages: ein Feld je halbe Stunde, Tooltip mit Zahlen. */
function CoverageStrip({ dd }: { dd: DayDebug }) {
  if (!dd.window) return <span className="text-slate-300">—</span>;
  const { start } = dd.window;
  const title = dd.slots
    .map((n, i) => `${minutesToTime(start + i * SLOT_MINUTES)} ${n} người`)
    .join("\n");
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-sm" title={title}>
      {dd.slots.map((n, i) => (
        <div key={i} className={`flex-1 ${slotColor(n)} ${i > 0 ? "border-l border-white/60" : ""}`} />
      ))}
    </div>
  );
}

const fmtH = (h: number) => `${Number.isInteger(h) ? h : h.toLocaleString("de-DE", { maximumFractionDigits: 1 })}h`;

function isWeekendKey(iso: string): boolean {
  const k = weekdayKeyOf(parseIsoDate(iso));
  return k === "saturday" || k === "sunday";
}

function cellClass(shift: Shift | undefined): string {
  if (!shift) return "shift-free";
  const base = shift.shiftType === "EARLY" ? "shift-early" : "shift-late";
  return `${base} ${!shift.generated ? "shift-custom" : ""}`;
}

export function ScheduleTab({ store }: { store: UseScheduleReturn }) {
  // Drucken (Monat/Woche) und Entsperren liegen im Tab „Bảng chấm công" –
  // dort sitzt alles, was Papier erzeugt.
  const { schedule, validation, generate, genError, isLocked, updateEmployee } = store;
  // Vor dem Planen wird nach Urlaub gefragt (siehe UrlaubDialog).
  const [urlaubOffen, setUrlaubOffen] = useState(false);
  const [selected, setSelected] = useState<{ employeeId: string; date: string } | null>(null);
  // Zweiter Klick, um einen gesperrten (gedruckten) Monat neu zu erzeugen.
  const [confirmRegen, setConfirmRegen] = useState(false);
  // Mặc định: điện thoại -> xem theo ngày, màn lớn -> bảng tháng.
  const [view, setView] = useState<"grid" | "day" | "week">(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? "day" : "grid",
  );
  const [weekIndex, setWeekIndex] = useState(0);

  const dates = useMemo(
    () => datesOfMonth(schedule.year, schedule.month),
    [schedule.year, schedule.month],
  );

  const weeks = useMemo(
    () => weeksOfMonth(schedule.year, schedule.month),
    [schedule.year, schedule.month],
  );

  /**
   * Tage, die im Raster gezeigt werden. In der Wochenansicht nur die der
   * gewählten Woche – gerechnet wird trotzdem immer mit dem ganzen Monat,
   * die Summen rechts bleiben also Monatssummen.
   */
  const gridDates = useMemo(() => {
    if (view !== "week") return dates;
    return weeks[Math.min(weekIndex, weeks.length - 1)]?.dates ?? dates;
  }, [view, weekIndex, weeks, dates]);

  // Tra nhanh: employeeId#date -> Shift
  const shiftMap = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of schedule.shifts) m.set(`${s.employeeId}#${s.date}`, s);
    return m;
  }, [schedule.shifts]);

  const summaryByEmp = useMemo(
    () => new Map(validation.summaries.map((s) => [s.employee.id, s] as const)),
    [validation.summaries],
  );

  const overridesByDate = useMemo(
    () => new Map(schedule.dateOverrides.map((o) => [o.date, o] as const)),
    [schedule.dateOverrides],
  );

  // Geschlossene Tage (Sonntag + Feiertag-Overrides + Betriebsruhe) vorab.
  const closedByDate = useMemo(() => {
    const holidays = publicHolidays(schedule.year);
    const ovMap = Object.fromEntries(schedule.dateOverrides.map((o) => [o.date, o]));
    const set = new Set<string>();
    for (const d of dates) {
      if (isDayClosed(schedule.workHours, d, holidays, ovMap)) set.add(d);
    }
    return set;
  }, [dates, schedule.workHours, schedule.year, schedule.dateOverrides]);

  // Tổng theo ngày cho các dòng chân bảng.
  const dayStats = useMemo(() => {
    const stats = new Map<string, { people: Set<string>; shifts: number; total: number; early: number; late: number }>();
    for (const d of dates) stats.set(d, { people: new Set(), shifts: 0, total: 0, early: 0, late: 0 });
    for (const s of schedule.shifts) {
      const st = stats.get(s.date);
      if (!st) continue;
      // „Số nhân viên" zählt PERSONEN – wer mittags und abends arbeitet, ist
      // eine Person mit zwei Diensten (Zeile „Số ca" darunter).
      st.people.add(s.employeeId);
      st.shifts += 1;
      st.total += s.paidMinutes;
      if (s.shiftType === "EARLY") st.early += 1;
      else st.late += 1; // LATE hoặc CUSTOM tính là ca tối
    }
    return stats;
  }, [dates, schedule.shifts]);

  const hasEmployees = schedule.employees.length > 0;

  // Debug-Zeilen und -Spalten: standardmäßig an (Wunsch des Betriebs), merkt
  // sich die Wahl je Gerät.
  const [debug, setDebugState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEBUG_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setDebug = (on: boolean) => {
    setDebugState(on);
    try {
      localStorage.setItem(DEBUG_KEY, on ? "1" : "0");
    } catch {
      /* egal – dann eben nur für diese Sitzung */
    }
  };
  const dayDebug = useMemo(() => buildDayDebug(schedule), [schedule]);
  const empDebug = useMemo(
    () => new Map(schedule.employees.map((e) => [e.id, buildEmployeeDebug(e, schedule)] as const)),
    [schedule],
  );
  // Zusatzspalten rechts: Ngày làm, Liền max, Ca ngắn–dài + eine je Woche.
  const debugCols = debug ? 3 + weeks.length : 0;
  const lengthHistogram = useMemo(() => {
    const m = new Map<number, number>();
    for (const sh of schedule.shifts) m.set(sh.paidMinutes / 60, (m.get(sh.paidMinutes / 60) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [schedule.shifts]);

  return (
    <section>
      {/* Alles Sichtbare liegt im no-print-Block; beim Drucken bleibt nur der
          Druckbereich ganz unten übrig. */}
      <div className="no-print">
      {urlaubOffen && (
        <UrlaubDialog
          employees={schedule.employees}
          year={schedule.year}
          month={schedule.month}
          updateEmployee={updateEmployee}
          isClosed={(iso) => closedByDate.has(iso)}
          onCancel={() => setUrlaubOffen(false)}
          onConfirm={() => {
            setUrlaubOffen(false);
            generate();
          }}
        />
      )}
      {/* Thanh thao tác */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => {
            // Gesperrter Monat: erst nachfragen, dann den Urlaub-Dialog öffnen
            // (das anschließende Erzeugen hebt die Sperre auf).
            if (isLocked && !confirmRegen) {
              setConfirmRegen(true);
              return;
            }
            setUrlaubOffen(true);
            setConfirmRegen(false);
          }}
          disabled={!hasEmployees}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:bg-slate-800 disabled:opacity-40"
        >
          Tạo lịch làm việc
        </button>
        {confirmRegen && (
          <button
            onClick={() => setConfirmRegen(false)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Huỷ
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500">{monthLabel(schedule.year, schedule.month)}</span>
      </div>

      {isLocked && confirmRegen && (
        <div className="mb-3 rounded bg-amber-50 border border-amber-300 text-amber-900 text-sm px-3 py-2">
          Tháng này đã in &amp; khóa. <b>Tạo lại lịch sẽ mở khóa tháng và xóa dấu các tuần đã in</b> —
          bản đã treo ở quán sẽ không còn khớp. Bấm lại <b>„Tạo lịch làm việc"</b> để tiếp tục.
        </div>
      )}

      {/*
        Nur ein kurzer Hinweis - Drucken und Entsperren sitzen im Tab
        "Bang cham cong". Ohne diesen Hinweis klickt man hier auf eine Zelle
        und nichts passiert, ohne zu erfahren warum.
      */}
      {isLocked && !confirmRegen && (
        <div className="mb-3 rounded bg-amber-50 border border-amber-200 text-amber-900 text-sm px-3 py-2">
          Lịch tháng này đã khóa vì đã in
          {schedule.lockedAt && ` lúc ${new Date(schedule.lockedAt).toLocaleString("vi-VN")}`} — chỉ
          xem, không sửa được. Mở khóa ở tab <b>Bảng chấm công</b>, hoặc bấm{" "}
          <b>„Tạo lịch làm việc"</b> để tạo lại (sẽ mở khóa).
        </div>
      )}

      {/* Chuyển chế độ xem */}
      {hasEmployees && (
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 mb-3">
          <button
            onClick={() => setView("day")}
            className={`px-3 py-1.5 text-sm rounded-md ${
              view === "day" ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            Theo ngày
          </button>
          <button
            onClick={() => setView("week")}
            className={`px-3 py-1.5 text-sm rounded-md ${
              view === "week" ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            Theo tuần
          </button>
          <button
            onClick={() => setView("grid")}
            className={`px-3 py-1.5 text-sm rounded-md ${
              view === "grid" ? "bg-slate-900 text-white" : "text-slate-600"
            }`}
          >
            Bảng tháng
          </button>
        </div>
      )}

      {/* Wochenwahl – nur in der Wochenansicht */}
      {hasEmployees && view === "week" && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {weeks.map((w, idx) => {
            const printed = (schedule.printedWeeks ?? []).includes(w.weekStart);
            return (
              <button
                key={w.weekStart}
                onClick={() => setWeekIndex(idx)}
                className={`rounded border px-3 py-1.5 text-sm ${
                  idx === weekIndex
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                title={printed ? "Tuần này đã in" : undefined}
              >
                {w.label}
                {printed && " ✓"}
              </button>
            );
          })}
          <span className="text-xs text-slate-500">In tuần ở tab „Bảng chấm công".</span>
        </div>
      )}

      {genError && (
        <div className="mb-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">
          {genError}
        </div>
      )}

      {/* Lỗi kiểm tra */}
      {!validation.valid && schedule.shifts.length > 0 && (
        <div className="mb-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2">
          <div className="font-medium mb-1">Lỗi kiểm tra ({validation.errors.length}):</div>
          <ul className="list-disc pl-5 space-y-0.5 max-h-40 overflow-auto">
            {validation.errors.slice(0, 30).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Chú thích (bảng tháng và bảng tuần dùng chung lưới) */}
      {view !== "day" && (
        <div className="flex flex-wrap gap-3 mb-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-early" /> Ca sáng
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-late" /> Ca tối
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-free" /> Nghỉ
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border shift-custom bg-white" /> Đã sửa tay
          </span>
          <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
            Hiện thông tin debug
          </label>
          {debug && (
            <span className="inline-flex items-center gap-1 text-slate-500">
              Độ phủ:
              <span className="inline-block h-3 w-3 rounded-sm bg-rose-500" /> 0
              <span className="inline-block h-3 w-3 rounded-sm bg-amber-300" /> 1
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-300" /> 2
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-600" /> 3+ người
            </span>
          )}
        </div>
      )}

      {!hasEmployees ? (
        <div className="rounded bg-white border border-slate-200 p-6 text-center text-slate-400">
          Vui lòng thêm nhân viên trước.
        </div>
      ) : view === "day" ? (
        <ScheduleDayView store={store} onEdit={(employeeId, date) => setSelected({ employeeId, date })} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white -mx-3 sm:mx-0">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-left min-w-[130px]">
                  Nhân viên
                </th>
                <th className="bg-slate-100 border-b border-slate-200 px-2 py-2 text-left">Loại</th>
                <th className="bg-slate-100 border-b border-slate-200 px-2 py-2 text-right">Định mức</th>
                {gridDates.map((d) => {
                  const day = parseIsoDate(d).getDate();
                  const wk = WEEKDAY_SHORT_VI[weekdayKeyOf(parseIsoDate(d))];
                  const ov = overridesByDate.get(d);
                  const closed = closedByDate.has(d);
                  const headerBg = closed
                    ? "bg-rose-100"
                    : ov
                      ? "bg-sky-100"
                      : isWeekendKey(d)
                        ? "bg-slate-200"
                        : "bg-slate-100";
                  return (
                    <th
                      key={d}
                      title={
                        closed
                          ? `Đóng cửa${ov?.note ? " · " + ov.note : ""}`
                          : ov
                            ? `Giờ riêng${ov.note ? " · " + ov.note : ""}`
                            : undefined
                      }
                      className={`border-b border-l border-slate-200 px-1 py-1 text-center min-w-[88px] ${headerBg}`}
                    >
                      <div className="font-semibold">{day}</div>
                      <div className="text-[10px] text-slate-500">{wk}</div>
                      {closed && <div className="text-[9px] text-rose-600 font-medium">Đóng cửa</div>}
                      {!closed && ov && <div className="text-[9px] text-sky-700 font-medium">Giờ riêng</div>}
                    </th>
                  );
                })}
                <th className="bg-slate-100 border-b border-l border-slate-200 px-2 py-2 text-right min-w-[64px]">
                  Đã xếp
                </th>
                <th className="bg-slate-100 border-b border-l border-slate-200 px-2 py-2 text-right min-w-[70px]">
                  Chênh lệch
                </th>
                {debug && (
                  <>
                    <th className="bg-amber-50 border-b border-l border-slate-200 px-2 py-2 text-right" title="Số ngày có ca trong tháng">
                      Ngày làm
                    </th>
                    <th className="bg-amber-50 border-b border-l border-slate-200 px-2 py-2 text-right" title="Chuỗi ngày làm liên tiếp dài nhất, tính cả cuối tháng trước (tối đa 6)">
                      Liền max
                    </th>
                    <th className="bg-amber-50 border-b border-l border-slate-200 px-2 py-2 text-right" title="Ca ngắn nhất – dài nhất (giờ trả lương)">
                      Ca ngắn–dài
                    </th>
                    {weeks.map((w) => (
                      <th
                        key={w.weekStart}
                        className="bg-amber-50 border-b border-l border-slate-200 px-2 py-1 text-center min-w-[78px]"
                        title="Giờ / số ngày trong tuần (T2–CN), tính cả ca của tháng trước/sau nếu tuần vắt tháng"
                      >
                        <div>Tuần</div>
                        <div className="text-[10px] font-normal text-slate-500">{fullWeekLabel(w.weekStart)}</div>
                      </th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {schedule.employees.map((emp) => {
                const sum = summaryByEmp.get(emp.id);
                const diff = sum?.diffMinutes ?? -emp.targetMinutes;
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/50">
                    <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-2 py-1 font-medium whitespace-nowrap">
                      {emp.name}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 text-slate-500">
                      {employmentShortVi(emp.employmentType)}
                    </td>
                    <td className="border-b border-slate-100 px-2 py-1 text-right text-slate-500">
                      {emp.targetMinutes / 60}h
                    </td>
                    {gridDates.map((d) => {
                      const shift = shiftMap.get(`${emp.id}#${d}`);
                      return (
                        <td
                          key={d}
                          onClick={() => setSelected({ employeeId: emp.id, date: d })}
                          className={`border-b border-l border-slate-200 px-1 py-1 text-center cursor-pointer align-middle ${cellClass(
                            shift,
                          )}`}
                          title="Bấm để sửa"
                        >
                          {shift ? (
                            <div className="leading-tight">
                              <div className="font-medium">
                                {minutesToTime(shift.startMinutes)}–{minutesToTime(shift.endMinutes)}
                              </div>
                              <div className="text-[10px] opacity-80">
                                {minutesToShortHours(shift.paidMinutes)} · Nghỉ {shift.pauseMinutes}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px]">Nghỉ</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-slate-200 px-2 py-1 text-right font-medium">
                      {((sum?.assignedMinutes ?? 0) / 60).toLocaleString("de-DE", {
                        maximumFractionDigits: 2,
                      })}
                      h
                    </td>
                    <td
                      className={`border-b border-l border-slate-200 px-2 py-1 text-right font-medium ${
                        diff === 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {signedHours(diff)}
                    </td>
                    {debug && (() => {
                      const ed = empDebug.get(emp.id)!;
                      return (
                        <>
                          <td className="border-b border-l border-slate-200 px-2 py-1 text-right">{ed.workDays}</td>
                          <td
                            className={`border-b border-l border-slate-200 px-2 py-1 text-right ${ed.maxRun > 6 ? "bg-rose-100 text-rose-700 font-semibold" : ""}`}
                          >
                            {ed.maxRun}
                          </td>
                          <td className="border-b border-l border-slate-200 px-2 py-1 text-right whitespace-nowrap">
                            {ed.workDays ? `${fmtH(ed.minShiftHours)}–${fmtH(ed.maxShiftHours)}` : "—"}
                          </td>
                          {ed.weeks.map((w) => {
                            const bad = w.tooManyDays || w.minijob === "over";
                            const warn = w.minijob === "flex";
                            return (
                              <td
                                key={w.weekStart}
                                className={`border-b border-l border-slate-200 px-1 py-1 text-center whitespace-nowrap ${
                                  bad ? "bg-rose-100 text-rose-700 font-semibold" : warn ? "bg-amber-100 text-amber-800" : ""
                                }`}
                                title={
                                  `${w.label}: ${w.hours}h, ${w.days} ngày` +
                                  (w.carryDays ? ` (trong đó ${w.carryHours}h / ${w.carryDays} ngày của tháng trước)` : "") +
                                  (emp.maxDaysPerWeek ? ` · tối đa ${emp.maxDaysPerWeek} ngày/tuần` : "") +
                                  (w.minijob ? ` · minijob ${MINIJOB_MAX_WEEKLY_HOURS}h (nới tối đa ${MINIJOB_FLEX_WEEKLY_HOURS}h)` : "")
                                }
                              >
                                <div>{fmtH(w.hours)} · {w.days}n</div>
                                {w.carryDays > 0 && (
                                  <div className="text-[10px] text-slate-500">+{fmtH(w.carryHours)} th.trước</div>
                                )}
                              </td>
                            );
                          })}
                        </>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <SummaryRow label="Số nhân viên" dates={gridDates} tail={debugCols} value={(d) => String(dayStats.get(d)!.people.size)} />
              <SummaryRow label="Số ca" dates={gridDates} tail={debugCols} value={(d) => String(dayStats.get(d)!.shifts)} />
              <SummaryRow
                label="Tổng giờ"
                dates={gridDates}
                tail={debugCols}
                value={(d) => minutesToShortHours(dayStats.get(d)!.total)}
              />
              <SummaryRow label="Ca sáng" dates={gridDates} tail={debugCols} value={(d) => String(dayStats.get(d)!.early)} />
              <SummaryRow label="Ca tối" dates={gridDates} value={(d) => String(dayStats.get(d)!.late)} tail={debugCols} />
              {debug && (
                <>
                  <SummaryRow
                    label="Khung giờ"
                    dates={gridDates}
                    tail={debugCols}
                    value={(d) => {
                      const dd = dayDebug.get(d)!;
                      if (!dd.window) return <span className="text-rose-600">Đóng cửa</span>;
                      return `${minutesToTime(dd.window.start)}–${minutesToTime(dd.window.end)}`;
                    }}
                  />
                  <SummaryRow
                    label="Độ phủ (30′)"
                    dates={gridDates}
                    tail={debugCols}
                    value={(d) => <CoverageStrip dd={dayDebug.get(d)!} />}
                  />
                  <SummaryRow
                    label="Trống người"
                    dates={gridDates}
                    tail={debugCols}
                    cellClass={(d) => (dayDebug.get(d)!.gaps.length ? "bg-rose-100 text-rose-700 font-semibold" : "")}
                    value={(d) => {
                      const dd = dayDebug.get(d)!;
                      if (!dd.window) return "";
                      if (!dd.gaps.length) return <span className="text-emerald-600">✓</span>;
                      return (
                        <div className="leading-tight">
                          {dd.gaps.map(([a, b]) => (
                            <div key={a}>{minutesToTime(a)}–{minutesToTime(b)}</div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <SummaryRow
                    label="Ít người nhất"
                    dates={gridDates}
                    tail={debugCols}
                    value={(d) => {
                      const dd = dayDebug.get(d)!;
                      return dd.window ? String(dd.minStaff) : "";
                    }}
                  />
                  <SummaryRow
                    label="Cao điểm"
                    dates={gridDates}
                    tail={debugCols}
                    cellClass={(d) =>
                      dayDebug.get(d)!.peaks.some((p) => !p.ok) ? "bg-amber-100 text-amber-800 font-semibold" : ""
                    }
                    value={(d) => {
                      const dd = dayDebug.get(d)!;
                      if (!dd.peaks.length) return <span className="text-slate-300">—</span>;
                      return (
                        <div className="leading-tight">
                          {dd.peaks.map((p) => (
                            <div key={p.label} title={`${p.label} ${minutesToTime(p.from)}–${minutesToTime(p.to)}`}>
                              {minutesToTime(p.from).slice(0, 2)}–{minutesToTime(p.to).slice(0, 2)}h: {p.minStaff}/{p.required}{" "}
                              {p.ok ? "✓" : "✗"}
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <SummaryRow
                    label="Mở cửa"
                    dates={gridDates}
                    tail={debugCols}
                    cellClass={(d) => (dayDebug.get(d)!.window && !dayDebug.get(d)!.openers.length ? "bg-rose-100 text-rose-700" : "")}
                    value={(d) => <span className="text-[10px]">{dayDebug.get(d)!.openers.join(", ")}</span>}
                  />
                  <SummaryRow
                    label="Đóng cửa"
                    dates={gridDates}
                    tail={debugCols}
                    cellClass={(d) => (dayDebug.get(d)!.window && !dayDebug.get(d)!.closers.length ? "bg-rose-100 text-rose-700" : "")}
                    value={(d) => <span className="text-[10px]">{dayDebug.get(d)!.closers.join(", ")}</span>}
                  />
                  <SummaryRow
                    label="Giờ mục tiêu / lệch"
                    dates={gridDates}
                    tail={debugCols}
                    value={(d) => {
                      const dd = dayDebug.get(d)!;
                      if (!dd.window) return "";
                      const lech = dd.paidHours - dd.targetHours;
                      return (
                        <div className="leading-tight" title="Giờ mục tiêu = tổng giờ đã xếp chia theo trọng số thứ trong tuần">
                          <div>{fmtH(Math.round(dd.targetHours * 10) / 10)}</div>
                          <div className={`text-[10px] ${Math.abs(lech) >= 3 ? "text-amber-700 font-semibold" : "text-slate-500"}`}>
                            {lech >= 0 ? "+" : ""}
                            {lech.toLocaleString("de-DE", { maximumFractionDigits: 1 })}h
                          </div>
                        </div>
                      );
                    }}
                  />
                </>
              )}
            </tfoot>
          </table>
        </div>
      )}

      {debug && hasEmployees && schedule.shifts.length > 0 && (
        <div className="mt-3 grid gap-3 md:grid-cols-3 text-xs">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="font-semibold text-slate-700 mb-1">
              Ca nhớ từ cuối tháng trước ({(schedule.carryOver ?? []).length})
            </div>
            <p className="text-slate-500 mb-1">
              Dùng để tính giới hạn tuần và 6 ngày liền cho tuần vắt tháng. Có khi chuyển tháng theo thứ tự (1 → 2 → 3…).
            </p>
            {(schedule.carryOver ?? []).length === 0 ? (
              <div className="text-slate-400">Không có.</div>
            ) : (
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {[...(schedule.carryOver ?? [])]
                  .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
                  .map((sh) => (
                    <li key={sh.id}>
                      {sh.date.slice(8)}.{sh.date.slice(5, 7)}.{" "}
                      {schedule.employees.find((e) => e.id === sh.employeeId)?.name ?? sh.employeeId}:{" "}
                      {minutesToTime(sh.startMinutes)}–{minutesToTime(sh.endMinutes)} ({fmtH(sh.paidMinutes / 60)})
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="font-semibold text-slate-700 mb-1">Tất cả lỗi / cảnh báo ({validation.errors.length})</div>
            {validation.errors.length === 0 ? (
              <div className="text-emerald-600">Không có.</div>
            ) : (
              <ul className="space-y-0.5 max-h-40 overflow-auto">
                {validation.errors.map((e, i) => (
                  <li key={i} className={e.severity === "warning" ? "text-amber-700" : "text-rose-700"}>
                    {e.severity === "warning" ? "⚠" : "✗"} {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="font-semibold text-slate-700 mb-1">Độ dài ca ({schedule.shifts.length} ca)</div>
            <div className="space-y-0.5">
              {lengthHistogram.map(([h, n]) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="w-8 text-right">{fmtH(h)}</span>
                  <div className="h-2 rounded bg-slate-400" style={{ width: `${(n / schedule.shifts.length) * 100}%` }} />
                  <span className="text-slate-500">{n}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-slate-500">
              Ngày trống người:{" "}
              <b className={[...dayDebug.values()].some((d) => d.gaps.length) ? "text-rose-600" : "text-emerald-600"}>
                {[...dayDebug.values()].filter((d) => d.gaps.length).length}
              </b>
              {" · "}Ngày thiếu cao điểm:{" "}
              <b>{[...dayDebug.values()].filter((d) => d.peaks.some((p) => !p.ok)).length}</b>
            </div>
          </div>
        </div>
      )}

      {/* Bearbeiten ist bei gesperrtem Monat gar nicht erst möglich. */}
      {selected && !isLocked && (
        <ShiftCellEditor
          store={store}
          employeeId={selected.employeeId}
          date={selected.date}
          onClose={() => setSelected(null)}
        />
      )}
      </div>
    </section>
  );
}

function SummaryRow({
  label,
  dates,
  value,
  tail = 0,
  cellClass,
}: {
  label: string;
  dates: string[];
  value: (d: string) => React.ReactNode;
  /** Zusätzliche leere Zellen rechts (Debug-Spalten). */
  tail?: number;
  cellClass?: (d: string) => string;
}) {
  return (
    <tr className="bg-slate-50 text-slate-600">
      <td className="sticky left-0 z-10 bg-slate-50 border-t border-r border-slate-200 px-2 py-1 font-medium whitespace-nowrap">
        {label}
      </td>
      <td className="border-t border-slate-200" />
      <td className="border-t border-slate-200" />
      {dates.map((d) => (
        <td key={d} className={`border-t border-l border-slate-200 px-1 py-1 text-center ${cellClass?.(d) ?? ""}`}>
          {value(d)}
        </td>
      ))}
      <td className="border-t border-l border-slate-200" />
      <td className="border-t border-l border-slate-200" />
      {Array.from({ length: tail }, (_, i) => (
        <td key={`t${i}`} className="border-t border-l border-slate-200" />
      ))}
    </tr>
  );
}

/**
 * Abfrage vor dem Erzeugen des Monatsplans: wer hat in diesem Monat Urlaub?
 *
 * Der Betrieb wollte das ausdrücklich als Zwischenschritt: "khi tạo lịch tháng
 * thì sẽ hỏi user nhập xem ai nghỉ urlaub". Der Automat sucht die Tage NICHT
 * selbst aus – wer wann frei nimmt, ist eine Absprache im Betrieb. Hier wird
 * nur eingesammelt, was schon feststeht, und sichtbar gemacht, wer über seinen
 * Jahresanspruch kommt.
 *
 * Dieselben Felder gibt es auch im Tab "Nhân viên". Das ist Absicht: dort
 * pflegt man die Belegschaft in Ruhe, hier wird man vor dem Planen noch einmal
 * daran erinnert, weil ein vergessener Urlaubstag erst auffällt, wenn der
 * fertige Plan schon hängt.
 */
function UrlaubDialog({
  employees,
  year,
  month,
  updateEmployee,
  isClosed,
  onCancel,
  onConfirm,
}: {
  employees: Employee[];
  year: number;
  month: number;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  isClosed: (iso: string) => boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const toggleUrlaub = (emp: Employee, iso: string) => {
    const jetzt = emp.vacationDates ?? [];
    updateEmployee(emp.id, {
      vacationDates: jetzt.includes(iso)
        ? jetzt.filter((d) => d !== iso)
        : [...jetzt, iso].sort(),
    });
  };

  // Je Person eine Zeile; der Kalender klappt erst auf Tipp auf. Offen sind
  // anfangs nur die, die in diesem Monat schon Urlaub haben – so ist der
  // Dialog ohne Urlaub ein kurzer Blick und ein Klick auf „Tạo lịch".
  const [offen, setOffen] = useState<Set<string>>(
    () => new Set(employees.filter((e) => vacationDatesInMonth(e, year, month).length > 0).map((e) => e.id)),
  );
  const umschalten = (id: string) =>
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl my-8">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            Ai nghỉ phép trong {monthLabel(year, month)}?
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Chọn ngày nghỉ trước khi tạo lịch. App <b>không tự chọn</b> ngày nghỉ — những
            ngày này sẽ được chừa ra khi xếp ca. Bỏ trống nếu không ai nghỉ.
          </p>
        </div>

        <div className="divide-y divide-slate-100 px-5">
          {employees.map((emp) => {
            const imMonat = vacationDatesInMonth(emp, year, month);
            const jahr = vacationDaysInYear(emp, year);
            const anspruch = vacationEntitlement(emp);
            const zuViel = jahr > anspruch;
            const aufgeklappt = offen.has(emp.id);
            const festeTage = emp.availableWeekdays?.length
              ? `chỉ làm ${emp.availableWeekdays.map((k) => WEEKDAY_SHORT_VI[k]).join(", ")}`
              : null;
            return (
              <div key={emp.id} className="py-2.5">
                <button
                  type="button"
                  onClick={() => umschalten(emp.id)}
                  aria-expanded={aufgeklappt}
                  className="flex w-full items-center gap-3 rounded px-1 py-1 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-slate-800">{emp.name}</span>
                      <span className="text-xs text-slate-400">
                        {employmentShortVi(emp.employmentType)}
                        {festeTage && ` · ${festeTage}`}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs">
                      {imMonat.length > 0 ? (
                        <span className="font-medium text-amber-700">
                          Nghỉ {imMonat.length} ngày: {imMonat.map((iso) => Number(iso.slice(8))).join(", ")}
                        </span>
                      ) : (
                        <span className="text-slate-400">Không nghỉ</span>
                      )}
                      <span className={zuViel ? "ml-2 font-medium text-rose-600" : "ml-2 text-slate-400"}>
                        · {jahr}/{anspruch} ngày trong năm {year}
                        {zuViel && " ⚠ vượt quy định"}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm text-slate-500">
                    {aufgeklappt ? "Đóng ▴" : "Chọn ngày ▾"}
                  </span>
                </button>
                {aufgeklappt && (
                  <div className="mt-2 pl-1">
                    <VacationPicker
                      year={year}
                      month={month}
                      selected={emp.vacationDates ?? []}
                      onToggle={(iso) => toggleUrlaub(emp, iso)}
                      isClosed={isClosed}
                      availableWeekdays={emp.availableWeekdays}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Huỷ
          </button>
          <button
            onClick={onConfirm}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Tạo lịch
          </button>
        </div>
      </div>
    </div>
  );
}

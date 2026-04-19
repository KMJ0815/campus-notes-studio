import React, { useMemo } from "react";
import { Clock3, Download, Plus, Settings } from "lucide-react";
import { DAY_DEFS } from "../../lib/constants";
import { slotKey, subjectColor } from "../../lib/utils";
import { IconButton, Panel } from "../../components/ui";

export function TimetablePage({ periods, slotItems, onSelectSubject, onCreateSubject, onOpenSettings, onExport, detailPanel }) {
  const slotMap = useMemo(() => {
    const map = new Map();
    for (const item of slotItems) {
      if (item.subject && !item.subject.isArchived && item.slot.activeSlotKey) {
        map.set(slotKey(item.slot.weekday, item.slot.periodNo), item);
      }
    }
    return map;
  }, [slotItems]);

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.6fr)_360px]">
      <Panel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">週次時間割</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <IconButton tone="light" icon={Settings} onClick={onOpenSettings}>
              コマ時間設定
            </IconButton>
            <IconButton tone="light" icon={Download} onClick={onExport}>
              エクスポート
            </IconButton>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[860px] rounded-3xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="grid grid-cols-[160px_repeat(6,minmax(0,1fr))] gap-3">
              <div className="rounded-2xl bg-white p-3 text-sm font-medium text-slate-500 ring-1 ring-slate-200">コマ / 時間</div>
              {DAY_DEFS.map((day) => (
                <div key={day.key} className="rounded-2xl bg-white p-3 text-center text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                  {day.label}
                </div>
              ))}

              {periods.filter((period) => period.isEnabled).map((period) => (
                <React.Fragment key={period.id}>
                  <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-semibold text-slate-900">{period.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{period.startTime} - {period.endTime}</p>
                  </div>
                  {DAY_DEFS.map((day) => {
                    const item = slotMap.get(slotKey(day.key, period.periodNo));
                    if (item) {
                      return (
                        <button
                          type="button"
                          key={slotKey(day.key, period.periodNo)}
                          onClick={() => onSelectSubject(item.subject.id)}
                          className="group rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 h-12 w-2 rounded-full" style={{ backgroundColor: subjectColor(item.subject) }} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{item.subject.name}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">{item.subject.room || "教室未設定"}</p>
                              {item.subject.teacherName ? <p className="mt-1 truncate text-xs text-slate-400">{item.subject.teacherName}</p> : null}
                            </div>
                          </div>
                        </button>
                      );
                    }

                    return (
                      <button
                        type="button"
                        key={slotKey(day.key, period.periodNo)}
                        onClick={() => onCreateSubject([slotKey(day.key, period.periodNo)])}
                        className="flex min-h-[108px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/80 text-sm text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          空きコマ
                        </span>
                      </button>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {detailPanel}
    </div>
  );
}

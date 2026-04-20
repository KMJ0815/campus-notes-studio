import React, { useMemo } from "react";
import { Download, Plus, Settings } from "lucide-react";
import { slotKey, subjectColor } from "../../lib/utils";
import { IconButton, Panel } from "../../components/ui";
import { TimetableGrid } from "./TimetableGrid";
import {
  TIMETABLE_CELL_MIN_HEIGHT_CLASS,
  TIMETABLE_EMPTY_CELL_CLASS,
  TIMETABLE_FILLED_CELL_CLASS,
} from "./timetableLayout";

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
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,384px)]">
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

        <div className="mt-5">
          <TimetableGrid
            periods={periods}
            renderCell={({ day, period }) => {
              const key = slotKey(day.key, period.periodNo);
              const item = slotMap.get(key);
              if (item) {
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => onSelectSubject(item.subject.id)}
                    className={`${TIMETABLE_FILLED_CELL_CLASS} ${TIMETABLE_CELL_MIN_HEIGHT_CLASS}`}
                    title={item.subject.name}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 h-9 w-2 shrink-0 rounded-full" style={{ backgroundColor: subjectColor(item.subject) }} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">{item.subject.name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{item.subject.room || "教室未設定"}</p>
                      </div>
                    </div>
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => onCreateSubject([key])}
                  className={`${TIMETABLE_EMPTY_CELL_CLASS} ${TIMETABLE_CELL_MIN_HEIGHT_CLASS}`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    空きコマ
                  </span>
                </button>
              );
            }}
          />
        </div>
      </Panel>

      <div className="min-w-0">{detailPanel}</div>
    </div>
  );
}

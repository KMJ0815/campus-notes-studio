import React from "react";
import { Clock3 } from "lucide-react";
import { DAY_DEFS } from "../../lib/constants";
import {
  TIMETABLE_CORNER_CELL_CLASS,
  TIMETABLE_FRAME_CLASS,
  TIMETABLE_GRID_GAP_CLASS,
  TIMETABLE_GRID_MIN_WIDTH_CLASS,
  TIMETABLE_GRID_TEMPLATE_CLASS,
  TIMETABLE_HEADER_CELL_CLASS,
  TIMETABLE_PERIOD_LABEL_CLASS,
  TIMETABLE_PERIOD_RAIL_CLASS,
  TIMETABLE_PERIOD_TIME_CLASS,
} from "./timetableLayout";

export function TimetableGrid({
  periods,
  leftHeaderLabel = "コマ / 時間",
  renderCell,
  className = "",
}) {
  const enabledPeriods = periods.filter((period) => period.isEnabled);

  return (
    <div className={`overflow-x-auto ${className}`}>
      <div className={`${TIMETABLE_GRID_MIN_WIDTH_CLASS} ${TIMETABLE_FRAME_CLASS}`}>
        <div className={`grid ${TIMETABLE_GRID_TEMPLATE_CLASS} ${TIMETABLE_GRID_GAP_CLASS}`}>
          <div className={TIMETABLE_CORNER_CELL_CLASS}>{leftHeaderLabel}</div>
          {DAY_DEFS.map((day) => (
            <div key={day.key} className={TIMETABLE_HEADER_CELL_CLASS}>
              {day.label}
            </div>
          ))}

          {enabledPeriods.map((period) => (
            <React.Fragment key={period.id}>
              <div className={TIMETABLE_PERIOD_RAIL_CLASS}>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                  <span className={TIMETABLE_PERIOD_LABEL_CLASS}>{period.label}</span>
                </div>
                <p className={TIMETABLE_PERIOD_TIME_CLASS}>
                  <span className="block">{period.startTime}</span>
                  <span className="block">{period.endTime}</span>
                </p>
              </div>
              {DAY_DEFS.map((day) => renderCell({ day, period }))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

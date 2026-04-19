import { CalendarDays, CheckCircle2, FileText, Paperclip } from "lucide-react";
import { EmptyState, IconButton, Panel, StatCard } from "../../components/ui";
import { formatShortDate } from "../../lib/utils";

export function DashboardPage({ summary, onOpenTimetable, onOpenSubject, onEditRecentNote }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CalendarDays} label="今学期の授業数" value={summary.activeSubjectsCount} />
        <StatCard icon={FileText} label="ノート件数" value={summary.notesCount} />
        <StatCard icon={Paperclip} label="資料件数" value={summary.materialsCount} />
        <StatCard icon={CheckCircle2} label="出席記録" value={summary.attendanceCount} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">今日の授業</h3>
            </div>
            <IconButton tone="light" icon={CalendarDays} onClick={onOpenTimetable}>
              時間割へ
            </IconButton>
          </div>
          <div className="mt-4 space-y-3">
            {summary.todayClasses.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="今日の授業は見つかりませんでした"
              />
            ) : (
              summary.todayClasses.map(({ slot, subject, period }) => (
                <button
                  type="button"
                  key={slot.id}
                  onClick={() => onOpenSubject(subject.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-2 rounded-full" style={{ backgroundColor: subject.color || "#4f46e5" }} />
                    <div>
                      <p className="font-medium text-slate-900">{subject.name}</p>
                      <p className="text-sm text-slate-500">
                        {period?.label} {period?.startTime} - {period?.endTime}
                        {subject.room ? ` ・ ${subject.room}` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">最近のノート</h3>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {summary.recentNotes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="まだノートがありません"
              />
            ) : (
              summary.recentNotes.map((note) => (
                <button
                  type="button"
                  key={note.id}
                  onClick={() => onEditRecentNote(note)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{note.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{note.subject?.name || "不明な授業"}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {formatShortDate(note.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{note.bodyText || "本文なし"}</p>
                </button>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

import { Archive, BookOpen, Pencil } from "lucide-react";
import { Chip, EmptyState, IconActionButton, IconButton, Panel, TextInput } from "../../components/ui";
import { dayLabelForKey, subjectColor } from "../../lib/utils";

export function LibraryPage({
  activeSubjects,
  archivedSubjects,
  periods,
  search,
  onSearchChange,
  onSelectSubject,
  onEditSubject,
  onArchiveSubject,
  onRestoreSubject,
  onCreateSubject,
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Panel>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">授業一覧</h3>
          </div>
          <div className="w-full md:w-80">
            <TextInput placeholder="授業名・教員名・教室で検索" value={search} onChange={(event) => onSearchChange(event.target.value)} />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {activeSubjects.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="授業が見つかりません"
              action={
                <IconButton onClick={onCreateSubject}>
                  授業を追加
                </IconButton>
              }
            />
          ) : (
            activeSubjects.map((subject) => (
              <div
                role="button"
                tabIndex={0}
                key={subject.id}
                onClick={() => onSelectSubject(subject.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelectSubject(subject.id);
                }}
                className="w-full overflow-hidden rounded-3xl border border-slate-200 p-4 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-1 h-12 w-2 shrink-0 rounded-full" style={{ backgroundColor: subjectColor(subject) }} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-lg font-semibold text-slate-900">{subject.name}</p>
                      <p className="mt-1 break-words text-sm text-slate-500">
                        {subject.teacherName || "教員未設定"}
                        {subject.room ? ` ・ ${subject.room}` : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {subject.slots.length === 0 ? (
                          <Chip>時間割未割当</Chip>
                        ) : (
                          subject.slots.map((slot) => {
                            const period = periods.find((item) => item.periodNo === slot.periodNo);
                            return (
                              <Chip key={slot.id} tone="indigo">
                                {dayLabelForKey(slot.weekday)} {period?.label || `${slot.periodNo}限`}
                              </Chip>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2 self-start">
                    <IconActionButton
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditSubject(subject);
                      }}
                      icon={Pencil}
                      label="授業を編集"
                    />
                    <IconActionButton
                      onClick={(event) => {
                        event.stopPropagation();
                        onArchiveSubject(subject);
                      }}
                      icon={Archive}
                      label="授業をアーカイブ"
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel>
        <h3 className="text-lg font-semibold text-slate-900">アーカイブ済み</h3>
        <div className="mt-5 space-y-3">
          {archivedSubjects.length === 0 ? (
            <EmptyState
              icon={Archive}
              title="アーカイブは空です"
            />
          ) : (
            archivedSubjects.map((subject) => (
              <div key={subject.id} className="overflow-hidden rounded-2xl border border-slate-200 p-4">
                <p className="break-words font-semibold text-slate-900">{subject.name}</p>
                <p className="mt-1 break-words text-sm text-slate-500">{subject.teacherName || "教員未設定"}</p>
                <div className="mt-3">
                  <IconButton tone="light" onClick={() => onRestoreSubject(subject)}>
                    復元
                  </IconButton>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

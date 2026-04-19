import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, BookOpen, CheckCircle2, FileText, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { ATTENDANCE_STATUS_OPTIONS, DETAIL_TABS } from "../../lib/constants";
import {
  emptyAttendanceDraft,
  formatDate,
  formatSlotLabel,
  nextLectureDateForSlots,
  normalizeDateOnlyInputValue,
  subjectColor,
} from "../../lib/utils";
import { errorMessage } from "../../lib/errors";
import { Chip, EmptyState, Field, IconActionButton, IconButton, Panel, SelectInput, TextArea, TextInput } from "../../components/ui";

export function SubjectDetailPanel({
  header,
  detailTab,
  tabLoading,
  notes,
  materials,
  attendance,
  onChangeTab,
  onEditSubject,
  onArchiveSubject,
  onCreateNote,
  onEditNote,
  onDeleteNote,
  onUploadMaterials,
  onOpenMaterial,
  onEditMaterial,
  onDeleteMaterial,
  onMaterialPickerError,
  onMaterialPickerOpen,
  onSaveAttendance,
  onDeleteAttendance,
  loadAttendanceSlotOptions,
}) {
  const fileInputRef = useRef(null);
  const [attendanceDraft, setAttendanceDraft] = useState(null);
  const [attendanceSlotOptions, setAttendanceSlotOptions] = useState([]);
  const [attendanceSlotOptionsReady, setAttendanceSlotOptionsReady] = useState(false);
  const [attendanceSlotOptionsError, setAttendanceSlotOptionsError] = useState("");
  const [attendanceSlotReloadNonce, setAttendanceSlotReloadNonce] = useState(0);
  const [attendanceDateTouched, setAttendanceDateTouched] = useState(false);
  const defaultAttendanceLectureDate = useMemo(() => nextLectureDateForSlots(header?.slots || []), [header?.slots]);

  function resetAttendanceDraft() {
    if (!header?.subject?.id) return;
    setAttendanceDateTouched(false);
    setAttendanceSlotOptionsError("");
    setAttendanceDraft(emptyAttendanceDraft(header.subject.id, defaultAttendanceLectureDate));
  }

  useEffect(() => {
    if (header?.subject?.id) {
      resetAttendanceDraft();
    } else {
      setAttendanceDraft(null);
      setAttendanceDateTouched(false);
    }
  }, [defaultAttendanceLectureDate, header?.subject?.id]);

  useEffect(() => {
    if (!attendanceDraft?.id) return;
    if (attendance.some((record) => record.id === attendanceDraft.id)) return;
    resetAttendanceDraft();
  }, [attendance, attendanceDraft?.id, defaultAttendanceLectureDate, header?.subject?.id]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!header?.subject?.id || !attendanceDraft?.lectureDate) {
        setAttendanceSlotOptions([]);
        setAttendanceSlotOptionsReady(false);
        setAttendanceSlotOptionsError("");
        return;
      }
      setAttendanceSlotOptionsReady(false);
      setAttendanceSlotOptionsError("");
      try {
        const options = await loadAttendanceSlotOptions(header.subject.id, attendanceDraft.lectureDate, {
          includeSlotIds: attendanceDraft?.timetableSlotId ? [attendanceDraft.timetableSlotId] : [],
        });
        if (!cancelled) {
          setAttendanceSlotOptions(options);
          setAttendanceSlotOptionsReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setAttendanceSlotOptions([]);
          setAttendanceSlotOptionsReady(true);
          setAttendanceSlotOptionsError(errorMessage(error, "出席候補の読み込みに失敗しました。"));
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [attendanceDraft?.lectureDate, attendanceDraft?.timetableSlotId, attendanceSlotReloadNonce, header?.subject?.id, loadAttendanceSlotOptions]);

  useEffect(() => {
    if (!attendanceDraft || attendanceDraft.id || attendanceDateTouched) return;
    if (!attendanceDraft.lectureDate || !attendanceSlotOptionsReady || attendanceSlotOptions.length > 0 || attendanceSlotOptionsError) return;
    if (!header?.slots?.some((slot) => slot.activeSlotKey)) return;

    const nextLectureDate = nextLectureDateForSlots(header.slots, attendanceDraft.lectureDate);
    if (!nextLectureDate || nextLectureDate === attendanceDraft.lectureDate) return;

    setAttendanceDraft((draft) => {
      if (!draft || draft.id || attendanceDateTouched) return draft;
      if (draft.lectureDate !== attendanceDraft.lectureDate) return draft;
      return {
        ...draft,
        lectureDate: nextLectureDate,
        timetableSlotId: "",
      };
    });
  }, [
    attendanceDateTouched,
    attendanceDraft,
    attendanceSlotOptionsError,
    attendanceSlotOptions.length,
    attendanceSlotOptionsReady,
    header?.slots,
  ]);

  const attendanceSummary = useMemo(() => {
    return {
      present: attendance.filter((record) => record.status === "present").length,
      late: attendance.filter((record) => record.status === "late").length,
      absent: attendance.filter((record) => record.status === "absent").length,
    };
  }, [attendance]);

  const openMaterialPicker = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) {
      onMaterialPickerError?.();
      return;
    }

    try {
      if (typeof input.showPicker === "function") {
        onMaterialPickerOpen?.();
        input.showPicker();
        return;
      }
      onMaterialPickerOpen?.();
      input.click();
    } catch {
      try {
        onMaterialPickerOpen?.();
        input.click();
      } catch {
        onMaterialPickerError?.();
      }
    }
  }, [onMaterialPickerError, onMaterialPickerOpen]);

  function startEditAttendance(record) {
    setAttendanceDateTouched(false);
    setAttendanceDraft({
      id: record.id,
      baseUpdatedAt: record.updatedAt,
      subjectId: record.subjectId,
      lectureDate: normalizeDateOnlyInputValue(record.lectureDate),
      timetableSlotId: record.timetableSlotId || "",
      status: record.status,
      memo: record.memo || "",
    });
  }

  async function handleSaveAttendance() {
    await onSaveAttendance(attendanceDraft);
    resetAttendanceDraft();
  }

  if (!header) {
    return (
      <Panel className="min-h-[640px]">
        <EmptyState
          icon={BookOpen}
          title="授業を選ぶと詳細がここに出ます"
        />
      </Panel>
    );
  }

  return (
    <Panel className="min-h-[640px]">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: subjectColor(header.subject) }} />
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Subject</p>
            </div>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">{header.subject.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {header.subject.teacherName || "教員未設定"}
              {header.subject.room ? ` ・ ${header.subject.room}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <IconActionButton onClick={() => onEditSubject(header.subject)} icon={Pencil} label="授業を編集" />
            {!header.subject.isArchived ? (
              <IconActionButton onClick={() => onArchiveSubject(header.subject)} icon={Archive} label="授業をアーカイブ" />
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {header.slots.length === 0 ? (
            <Chip>時間割未割当</Chip>
          ) : (
            header.slots.map((slot) => (
              <Chip key={slot.id} tone="indigo">
                {formatSlotLabel(slot, header.periods)}
              </Chip>
            ))
          )}
        </div>

        {header.subject.memo ? <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{header.subject.memo}</div> : null}

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">ノート</p>
            <p className="mt-1 text-xl font-semibold">{header.notesCount}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">資料</p>
            <p className="mt-1 text-xl font-semibold">{header.materialsCount}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">出席</p>
            <p className="mt-1 text-xl font-semibold">{header.attendanceCount}</p>
          </div>
        </div>

        <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
          {[
            { key: DETAIL_TABS.notes, label: "ノート" },
            { key: DETAIL_TABS.materials, label: "資料" },
            { key: DETAIL_TABS.attendance, label: "出席" },
          ].map((tab) => (
            <button
              type="button"
              key={tab.key}
              onClick={() => onChangeTab(tab.key)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                detailTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {tabLoading ? <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">読み込み中…</div> : null}

        {detailTab === DETAIL_TABS.notes ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <IconButton icon={Plus} onClick={() => onCreateNote(header.subject.id)}>
                ノート追加
              </IconButton>
            </div>
            {notes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="まだノートがありません"
                action={
                  <IconButton icon={Plus} onClick={() => onCreateNote(header.subject.id)}>
                    最初のノートを作る
                  </IconButton>
                }
              />
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{note.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        講義日 {note.lectureDate || "未設定"} ・ 更新 {formatDate(note.updatedAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <IconActionButton onClick={() => onEditNote(note)} icon={Pencil} label="ノートを編集" />
                      <IconActionButton onClick={() => onDeleteNote(note)} icon={Trash2} label="ノートを削除" tone="danger" />
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-slate-600">{note.bodyText || "本文なし"}</p>
                </div>
              ))
            )}
          </div>
        ) : null}

        {detailTab === DETAIL_TABS.materials ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  onUploadMaterials(Array.from(event.target.files || []));
                  event.target.value = "";
                }}
              />
              <IconButton icon={Plus} onClick={openMaterialPicker}>
                資料を追加
              </IconButton>
            </div>
            {materials.length === 0 ? (
              <EmptyState
                icon={Paperclip}
                title="まだ資料がありません"
                description="上の「資料を追加」からファイルを選択できます。"
              />
            ) : (
              materials.map((meta) => (
                <div key={meta.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{meta.displayName}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {(meta.sizeBytes / 1024).toFixed(1)} KB ・ {meta.mimeType || meta.fileExt || "ファイル"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">追加 {formatDate(meta.createdAt)}</p>
                      {meta.note ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{meta.note}</p> : <p className="mt-2 text-sm text-slate-400">資料メモなし</p>}
                    </div>
                    <div className="flex gap-2">
                      <IconButton tone="light" onClick={() => onOpenMaterial(meta)}>
                        開く
                      </IconButton>
                      <IconActionButton onClick={() => onEditMaterial(meta)} icon={Pencil} label="資料メモを編集" />
                      <IconActionButton onClick={() => onDeleteMaterial(meta)} icon={Trash2} label="資料を削除" tone="danger" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {detailTab === DETAIL_TABS.attendance ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">出席</p>
                <p className="mt-1 text-xl font-semibold text-emerald-900">{attendanceSummary.present}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3">
                <p className="text-xs text-amber-700">遅刻</p>
                <p className="mt-1 text-xl font-semibold text-amber-900">{attendanceSummary.late}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-3">
                <p className="text-xs text-rose-700">欠席</p>
                <p className="mt-1 text-xl font-semibold text-rose-900">{attendanceSummary.absent}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900">{attendanceDraft?.id ? "出席を編集" : "出席を記録"}</h4>
                {attendanceDraft?.id ? (
                  <IconButton
                    tone="light"
                    onClick={() => {
                      resetAttendanceDraft();
                    }}
                  >
                    新規入力へ戻す
                  </IconButton>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                <Field label="講義日">
                  <TextInput
                    type="date"
                    value={attendanceDraft?.lectureDate ?? ""}
                    onChange={(event) => {
                      setAttendanceDateTouched(true);
                      setAttendanceSlotOptionsError("");
                      setAttendanceDraft((draft) => ({ ...draft, lectureDate: event.target.value, timetableSlotId: "" }));
                    }}
                  />
                </Field>
                {attendanceSlotOptionsError ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    <span>{attendanceSlotOptionsError}</span>
                    <IconButton tone="light" className="shrink-0" onClick={() => setAttendanceSlotReloadNonce((current) => current + 1)}>
                      再試行
                    </IconButton>
                  </div>
                ) : null}

                {attendanceDraft?.lectureDate && attendanceSlotOptionsReady && !attendanceSlotOptionsError && attendanceSlotOptions.length === 0 ? (
                  <p className="text-xs text-slate-500">この日は時間割上の該当コマがありません。コマ未指定で保存されます。</p>
                ) : null}

                {attendanceSlotOptions.length > 1 ? (
                  <Field label="該当コマ">
                    <SelectInput
                      value={attendanceDraft?.timetableSlotId || ""}
                      onChange={(event) => setAttendanceDraft((draft) => ({ ...draft, timetableSlotId: event.target.value }))}
                    >
                      <option value="">コマを選択</option>
                      {attendanceSlotOptions.map((slotOption) => (
                        <option key={slotOption.id} value={slotOption.id}>
                          {slotOption.label}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                ) : null}

                <Field label="ステータス">
                  <SelectInput value={attendanceDraft?.status || "present"} onChange={(event) => setAttendanceDraft((draft) => ({ ...draft, status: event.target.value }))}>
                    {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="メモ">
                  <TextArea rows={3} value={attendanceDraft?.memo || ""} onChange={(event) => setAttendanceDraft((draft) => ({ ...draft, memo: event.target.value }))} placeholder="補足があればここに" />
                </Field>
                <div className="flex justify-end">
                  <IconButton icon={CheckCircle2} onClick={handleSaveAttendance} disabled={Boolean(attendanceSlotOptionsError)}>
                    保存
                  </IconButton>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {attendance.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="出席履歴はまだありません"
              />
            ) : (
                attendance.map((record) => (
                  <div key={record.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{record.lectureDate}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {record.status === "present" ? (
                            <Chip tone="emerald">出席</Chip>
                          ) : record.status === "late" ? (
                            <Chip tone="amber">遅刻</Chip>
                          ) : (
                            <Chip tone="rose">欠席</Chip>
                          )}
                          {record.slotLabel ? <Chip tone="indigo">{record.slotLabel}</Chip> : <Chip>コマ未指定</Chip>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <IconActionButton onClick={() => startEditAttendance(record)} icon={Pencil} label="出席を編集" />
                        <IconActionButton onClick={() => onDeleteAttendance(record)} icon={Trash2} label="出席を削除" tone="danger" />
                      </div>
                    </div>
                    {record.memo ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{record.memo}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

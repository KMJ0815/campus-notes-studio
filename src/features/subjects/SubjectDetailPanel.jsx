import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, BookOpen, CheckCircle2, FileText, ListTodo, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { ATTENDANCE_STATUS_OPTIONS, DETAIL_TABS } from "../../lib/constants";
import {
  emptyAttendanceDraft,
  emptyTodoDraft,
  formatDate,
  formatSlotLabel,
  nextLectureDateForSlots,
  normalizeDateOnlyInputValue,
  normalizeNoteTitle,
  parseOptionalDateInput,
  parseRequiredDateInput,
  subjectColor,
} from "../../lib/utils";
import { errorMessage } from "../../lib/errors";
import { Chip, EmptyState, Field, IconActionButton, IconButton, Panel, SelectInput, TextArea, TextInput } from "../../components/ui";
import { TodoFormModal } from "../todos/TodoFormModal";

function TodoItemCard({ todo, isDone = false, pending = false, onToggle, onEdit, onDelete }) {
  return (
    <div className={`rounded-3xl border border-slate-200 p-4 ${isDone ? "bg-slate-50" : "bg-white"}`}>
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className={`break-words text-sm font-semibold leading-6 ${isDone ? "text-slate-700 line-through" : "text-slate-900"}`}>
              {todo.title}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {todo.dueDate ? <Chip tone="amber">{`期限 ${todo.dueDate}`}</Chip> : null}
              {isDone ? <Chip tone="emerald">完了</Chip> : null}
            </div>
            {todo.memo ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{todo.memo}</p>
            ) : null}
            <p className="mt-3 text-xs text-slate-400">更新 {formatDate(todo.updatedAt)}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <IconButton tone="light" onClick={onToggle} disabled={pending} className="w-full justify-center">
            {isDone ? "未完了へ戻す" : "完了にする"}
          </IconButton>
          <div className="flex items-center justify-end gap-1">
            <IconActionButton onClick={onEdit} icon={Pencil} label="ToDo を編集" disabled={pending} />
            <IconActionButton onClick={onDelete} icon={Trash2} label="ToDo を削除" tone="danger" disabled={pending} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SubjectDetailPanel({
  header,
  detailTab,
  tabLoading,
  notes = [],
  materials = [],
  attendance = [],
  todos = [],
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
  onSaveTodo = async () => {},
  onDeleteTodo = async () => {},
}) {
  const fileInputRef = useRef(null);
  const materialPickerSubjectIdRef = useRef(null);
  const [attendanceDraft, setAttendanceDraft] = useState(null);
  const [attendanceSlotOptions, setAttendanceSlotOptions] = useState([]);
  const [attendanceSlotOptionsReady, setAttendanceSlotOptionsReady] = useState(false);
  const [attendanceSlotOptionsError, setAttendanceSlotOptionsError] = useState("");
  const [attendanceDateError, setAttendanceDateError] = useState("");
  const [attendanceSlotReloadNonce, setAttendanceSlotReloadNonce] = useState(0);
  const [attendanceDateTouched, setAttendanceDateTouched] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [quickTodoTitle, setQuickTodoTitle] = useState("");
  const [quickTodoDueDate, setQuickTodoDueDate] = useState("");
  const [quickTodoDueDateError, setQuickTodoDueDateError] = useState("");
  const [savingQuickTodo, setSavingQuickTodo] = useState(false);
  const [todoEditorInitialValue, setTodoEditorInitialValue] = useState(null);
  const [showCompletedTodos, setShowCompletedTodos] = useState(false);
  const [pendingTodoIds, setPendingTodoIds] = useState(() => new Set());
  const [pendingNoteIds, setPendingNoteIds] = useState(() => new Set());
  const [pendingMaterialIds, setPendingMaterialIds] = useState(() => new Set());
  const [pendingAttendanceDeleteIds, setPendingAttendanceDeleteIds] = useState(() => new Set());
  const [archivePending, setArchivePending] = useState(false);
  const currentSubjectIdRef = useRef(header?.subject?.id || null);
  const subjectSessionRef = useRef(0);
  const savingAttendanceRef = useRef(false);
  const quickTodoSavePendingRef = useRef(false);
  const pendingTodoIdsRef = useRef(new Set());
  const pendingNoteIdsRef = useRef(new Set());
  const pendingMaterialIdsRef = useRef(new Set());
  const pendingAttendanceDeleteIdsRef = useRef(new Set());
  const archivePendingRef = useRef(false);
  const defaultAttendanceLectureDate = useMemo(() => nextLectureDateForSlots(header?.slots || []), [header?.slots]);
  const openTodos = useMemo(() => todos.filter((todo) => todo.status !== "done"), [todos]);
  const doneTodos = useMemo(() => todos.filter((todo) => todo.status === "done"), [todos]);

  function resetAttendanceDraft() {
    if (!header?.subject?.id) return;
    setAttendanceDateTouched(false);
    setAttendanceDateError("");
    setAttendanceSlotOptionsError("");
    setAttendanceDraft(emptyAttendanceDraft(header.subject.id, defaultAttendanceLectureDate));
  }

  useEffect(() => {
    currentSubjectIdRef.current = header?.subject?.id || null;
  }, [header?.subject?.id]);

  useEffect(() => {
    subjectSessionRef.current += 1;
    if (header?.subject?.id) {
      resetAttendanceDraft();
      setSavingAttendance(false);
      savingAttendanceRef.current = false;
      setQuickTodoTitle("");
      setQuickTodoDueDate("");
      setQuickTodoDueDateError("");
      setSavingQuickTodo(false);
      quickTodoSavePendingRef.current = false;
      pendingTodoIdsRef.current = new Set();
      setPendingTodoIds(new Set());
      pendingNoteIdsRef.current = new Set();
      setPendingNoteIds(new Set());
      pendingMaterialIdsRef.current = new Set();
      setPendingMaterialIds(new Set());
      pendingAttendanceDeleteIdsRef.current = new Set();
      setPendingAttendanceDeleteIds(new Set());
      setTodoEditorInitialValue(null);
      setShowCompletedTodos(false);
      setArchivePending(false);
      archivePendingRef.current = false;
    } else {
      setAttendanceDraft(null);
      setAttendanceDateTouched(false);
      setSavingAttendance(false);
      savingAttendanceRef.current = false;
      setQuickTodoTitle("");
      setQuickTodoDueDate("");
      setQuickTodoDueDateError("");
      setSavingQuickTodo(false);
      quickTodoSavePendingRef.current = false;
      pendingTodoIdsRef.current = new Set();
      setPendingTodoIds(new Set());
      pendingNoteIdsRef.current = new Set();
      setPendingNoteIds(new Set());
      pendingMaterialIdsRef.current = new Set();
      setPendingMaterialIds(new Set());
      pendingAttendanceDeleteIdsRef.current = new Set();
      setPendingAttendanceDeleteIds(new Set());
      setTodoEditorInitialValue(null);
      setShowCompletedTodos(false);
      setArchivePending(false);
      archivePendingRef.current = false;
    }
  }, [header?.subject?.id]);

  useEffect(() => {
    if (!header?.subject?.id) return;
    if (!defaultAttendanceLectureDate) return;
    setAttendanceSlotOptionsError("");
    setAttendanceDraft((draft) => {
      if (!draft || draft.subjectId !== header.subject.id || draft.id || attendanceDateTouched) return draft;
      const nextLectureDate = normalizeDateOnlyInputValue(defaultAttendanceLectureDate);
      if (!nextLectureDate || draft.lectureDate === nextLectureDate) return draft;
      return {
        ...draft,
        lectureDate: nextLectureDate,
        timetableSlotId: "",
      };
    });
  }, [attendanceDateTouched, defaultAttendanceLectureDate, header?.subject?.id]);

  useEffect(() => {
    if (!attendanceDraft?.id) return;
    if (attendance.some((record) => record.id === attendanceDraft.id)) return;
    resetAttendanceDraft();
  }, [attendance, attendanceDraft?.id, defaultAttendanceLectureDate, header?.subject?.id]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (detailTab !== DETAIL_TABS.attendance || !header?.subject?.id || !attendanceDraft?.lectureDate) {
        setAttendanceSlotOptions([]);
        setAttendanceSlotOptionsReady(false);
        setAttendanceSlotOptionsError("");
        return;
      }
      const lectureDateInput = parseRequiredDateInput(attendanceDraft.lectureDate, { fieldLabel: "講義日" });
      if (!lectureDateInput.isValid) {
        setAttendanceSlotOptions([]);
        setAttendanceSlotOptionsReady(false);
        setAttendanceSlotOptionsError("");
        return;
      }
      setAttendanceSlotOptionsReady(false);
      setAttendanceSlotOptionsError("");
      try {
        const options = await loadAttendanceSlotOptions(header.subject.id, lectureDateInput.normalized, {
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
  }, [attendanceDraft?.lectureDate, attendanceDraft?.timetableSlotId, attendanceSlotReloadNonce, detailTab, header?.subject?.id, loadAttendanceSlotOptions]);

  useEffect(() => {
    if (detailTab !== DETAIL_TABS.attendance) return;
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
    detailTab,
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
    materialPickerSubjectIdRef.current = header?.subject?.id || null;
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
  }, [header?.subject?.id, onMaterialPickerError, onMaterialPickerOpen]);

  function startEditAttendance(record) {
    setAttendanceDateTouched(false);
    setAttendanceDateError("");
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
    if (!attendanceDraft || savingAttendanceRef.current || attendanceSlotOptionsError) return;
    const lectureDateInput = parseRequiredDateInput(attendanceDraft.lectureDate, { fieldLabel: "講義日" });
    if (!lectureDateInput.isValid) {
      setAttendanceDateError(lectureDateInput.error);
      return;
    }
    const subjectId = header?.subject?.id || null;
    const sessionId = subjectSessionRef.current;
    savingAttendanceRef.current = true;
    setSavingAttendance(true);
    try {
      await onSaveAttendance({ ...attendanceDraft, lectureDate: lectureDateInput.normalized });
      if (subjectSessionRef.current !== sessionId || currentSubjectIdRef.current !== subjectId) return;
      resetAttendanceDraft();
    } catch {
      return;
    } finally {
      if (subjectSessionRef.current !== sessionId || currentSubjectIdRef.current !== subjectId) return;
      savingAttendanceRef.current = false;
      setSavingAttendance(false);
    }
  }

  function openTodoEditor(todo) {
    setTodoEditorInitialValue(
      emptyTodoDraft(header.subject.id, {
        id: todo.id,
        title: todo.title,
        memo: todo.memo || "",
        dueDate: normalizeDateOnlyInputValue(todo.dueDate),
        status: todo.status,
        completedAt: todo.completedAt || null,
        baseUpdatedAt: todo.updatedAt,
      }),
    );
  }

  function closeTodoEditor() {
    setTodoEditorInitialValue(null);
  }

  function beginTodoPending(todoId) {
    if (pendingTodoIdsRef.current.has(todoId)) return false;
    const nextPendingTodoIds = new Set(pendingTodoIdsRef.current);
    nextPendingTodoIds.add(todoId);
    pendingTodoIdsRef.current = nextPendingTodoIds;
    setPendingTodoIds(nextPendingTodoIds);
    return true;
  }

  function endTodoPending(todoId) {
    if (!pendingTodoIdsRef.current.has(todoId)) return;
    const nextPendingTodoIds = new Set(pendingTodoIdsRef.current);
    nextPendingTodoIds.delete(todoId);
    pendingTodoIdsRef.current = nextPendingTodoIds;
    setPendingTodoIds(nextPendingTodoIds);
  }

  function beginNotePending(noteId) {
    if (pendingNoteIdsRef.current.has(noteId)) return false;
    const nextPendingNoteIds = new Set(pendingNoteIdsRef.current);
    nextPendingNoteIds.add(noteId);
    pendingNoteIdsRef.current = nextPendingNoteIds;
    setPendingNoteIds(nextPendingNoteIds);
    return true;
  }

  function endNotePending(noteId) {
    if (!pendingNoteIdsRef.current.has(noteId)) return;
    const nextPendingNoteIds = new Set(pendingNoteIdsRef.current);
    nextPendingNoteIds.delete(noteId);
    pendingNoteIdsRef.current = nextPendingNoteIds;
    setPendingNoteIds(nextPendingNoteIds);
  }

  function beginMaterialPending(materialId) {
    if (pendingMaterialIdsRef.current.has(materialId)) return false;
    const nextPendingMaterialIds = new Set(pendingMaterialIdsRef.current);
    nextPendingMaterialIds.add(materialId);
    pendingMaterialIdsRef.current = nextPendingMaterialIds;
    setPendingMaterialIds(nextPendingMaterialIds);
    return true;
  }

  function endMaterialPending(materialId) {
    if (!pendingMaterialIdsRef.current.has(materialId)) return;
    const nextPendingMaterialIds = new Set(pendingMaterialIdsRef.current);
    nextPendingMaterialIds.delete(materialId);
    pendingMaterialIdsRef.current = nextPendingMaterialIds;
    setPendingMaterialIds(nextPendingMaterialIds);
  }

  function beginAttendanceDeletePending(attendanceId) {
    if (pendingAttendanceDeleteIdsRef.current.has(attendanceId)) return false;
    const nextPendingAttendanceDeleteIds = new Set(pendingAttendanceDeleteIdsRef.current);
    nextPendingAttendanceDeleteIds.add(attendanceId);
    pendingAttendanceDeleteIdsRef.current = nextPendingAttendanceDeleteIds;
    setPendingAttendanceDeleteIds(nextPendingAttendanceDeleteIds);
    return true;
  }

  function endAttendanceDeletePending(attendanceId) {
    if (!pendingAttendanceDeleteIdsRef.current.has(attendanceId)) return;
    const nextPendingAttendanceDeleteIds = new Set(pendingAttendanceDeleteIdsRef.current);
    nextPendingAttendanceDeleteIds.delete(attendanceId);
    pendingAttendanceDeleteIdsRef.current = nextPendingAttendanceDeleteIds;
    setPendingAttendanceDeleteIds(nextPendingAttendanceDeleteIds);
  }

  async function handleArchiveClick() {
    if (!header?.subject || archivePendingRef.current) return;
    const subjectId = header.subject.id;
    const sessionId = subjectSessionRef.current;
    archivePendingRef.current = true;
    setArchivePending(true);
    try {
      await onArchiveSubject(header.subject);
    } finally {
      if (subjectSessionRef.current !== sessionId || currentSubjectIdRef.current !== subjectId) return;
      archivePendingRef.current = false;
      setArchivePending(false);
    }
  }

  async function handleQuickAddTodo(event) {
    event?.preventDefault();
    if (!header?.subject?.id || !quickTodoTitle.trim() || quickTodoSavePendingRef.current) return;
    const dueDateInput = parseOptionalDateInput(quickTodoDueDate, { fieldLabel: "期限日" });
    if (!dueDateInput.isValid) {
      setQuickTodoDueDateError(dueDateInput.error);
      return;
    }

    const subjectId = header.subject.id;
    const sessionId = subjectSessionRef.current;
    quickTodoSavePendingRef.current = true;
    setSavingQuickTodo(true);
    let didSave = false;
    try {
      await onSaveTodo(
        emptyTodoDraft(header.subject.id, {
          title: quickTodoTitle,
          dueDate: dueDateInput.normalized,
        }),
      );
      didSave = true;
    } catch {
      return;
    } finally {
      if (subjectSessionRef.current !== sessionId || currentSubjectIdRef.current !== subjectId) return;
      if (didSave) {
        setQuickTodoTitle("");
        setQuickTodoDueDate("");
        setQuickTodoDueDateError("");
      }
      quickTodoSavePendingRef.current = false;
      setSavingQuickTodo(false);
    }
  }

  async function handleToggleTodo(todo) {
    if (!beginTodoPending(todo.id)) return;
    try {
      await onSaveTodo({
        ...emptyTodoDraft(todo.subjectId, {
          ...todo,
          dueDate: normalizeDateOnlyInputValue(todo.dueDate),
          status: todo.status === "done" ? "open" : "done",
          baseUpdatedAt: todo.updatedAt,
        }),
      });
    } catch {
      return;
    } finally {
      endTodoPending(todo.id);
    }
  }

  async function handleDeleteTodo(todo) {
    if (!beginTodoPending(todo.id)) return;
    try {
      const result = await onDeleteTodo(todo);
      const status = result?.status || "deleted";
      if ((status === "deleted" || status === "stale") && todoEditorInitialValue?.id === todo.id) {
        closeTodoEditor();
      }
    } catch {
      return;
    } finally {
      endTodoPending(todo.id);
    }
  }

  async function handleDeleteNote(note) {
    if (!beginNotePending(note.id)) return;
    try {
      await onDeleteNote(note);
    } finally {
      endNotePending(note.id);
    }
  }

  async function handleDeleteMaterial(meta) {
    if (!beginMaterialPending(meta.id)) return;
    try {
      await onDeleteMaterial(meta);
    } finally {
      endMaterialPending(meta.id);
    }
  }

  async function handleDeleteAttendance(record) {
    if (!beginAttendanceDeletePending(record.id)) return;
    try {
      await onDeleteAttendance(record);
    } finally {
      endAttendanceDeletePending(record.id);
    }
  }

  if (!header) {
    return (
      <Panel className="min-w-0 sm:min-h-[640px]">
        <EmptyState
          icon={BookOpen}
          title="授業を選ぶと詳細がここに出ます"
        />
      </Panel>
    );
  }

  return (
    <Panel className="min-w-0 sm:min-h-[640px]">
      <div className="min-w-0 space-y-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: subjectColor(header.subject) }} />
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Subject</p>
            </div>
            <h3 className="mt-2 break-words text-2xl font-semibold text-slate-900">{header.subject.name}</h3>
            <p className="mt-1 break-words text-sm text-slate-500">
              {header.subject.teacherName || "教員未設定"}
              {header.subject.room ? ` ・ ${header.subject.room}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <IconActionButton onClick={() => onEditSubject(header.subject)} icon={Pencil} label="授業を編集" />
            {!header.subject.isArchived ? (
              <IconActionButton onClick={handleArchiveClick} icon={Archive} label="授業をアーカイブ" disabled={archivePending} />
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

        {header.subject.memo ? <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600 break-words">{header.subject.memo}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">未完了ToDo</p>
            <p className="mt-1 text-xl font-semibold">{header.openTodosCount ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">完了済み {header.doneTodosCount ?? 0}</p>
          </div>
        </div>

        <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
          {[
            { key: DETAIL_TABS.notes, label: "ノート" },
            { key: DETAIL_TABS.materials, label: "資料" },
            { key: DETAIL_TABS.attendance, label: "出席" },
            { key: DETAIL_TABS.todos, label: "ToDo" },
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
                <div key={note.id} className="overflow-hidden rounded-2xl border border-slate-200 p-4">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-slate-900">{normalizeNoteTitle(note.title)}</p>
                      <p className="mt-1 break-words text-xs text-slate-400">
                        講義日 {note.lectureDate || "未設定"} ・ 更新 {formatDate(note.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2 self-start">
                      <IconActionButton onClick={() => onEditNote(note)} icon={Pencil} label="ノートを編集" />
                      <IconActionButton
                        onClick={() => handleDeleteNote(note)}
                        icon={Trash2}
                        label="ノートを削除"
                        tone="danger"
                        disabled={pendingNoteIds.has(note.id)}
                      />
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{note.bodyText || "本文なし"}</p>
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
                  onUploadMaterials(materialPickerSubjectIdRef.current || header?.subject?.id || null, Array.from(event.target.files || []));
                  event.target.value = "";
                  materialPickerSubjectIdRef.current = null;
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
                <div key={meta.id} className="overflow-hidden rounded-2xl border border-slate-200 p-4">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-slate-900">{meta.displayName}</p>
                      <p className="mt-1 break-words text-xs text-slate-400">
                        {(meta.sizeBytes / 1024).toFixed(1)} KB ・ {meta.mimeType || meta.fileExt || "ファイル"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">追加 {formatDate(meta.createdAt)}</p>
                      {meta.note ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{meta.note}</p> : <p className="mt-2 text-sm text-slate-400">資料メモなし</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <IconButton tone="light" onClick={() => onOpenMaterial(meta)}>
                        開く
                      </IconButton>
                      <IconActionButton onClick={() => onEditMaterial(meta)} icon={Pencil} label="資料メモを編集" />
                      <IconActionButton
                        onClick={() => handleDeleteMaterial(meta)}
                        icon={Trash2}
                        label="資料を削除"
                        tone="danger"
                        disabled={pendingMaterialIds.has(meta.id)}
                      />
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
                    disabled={savingAttendance}
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
                  <>
                    <TextInput
                      type="text"
                      placeholder="YYYY-MM-DD"
                      inputMode="numeric"
                      value={attendanceDraft?.lectureDate ?? ""}
                      disabled={savingAttendance}
                      onChange={(event) => {
                        setAttendanceDateTouched(true);
                        setAttendanceDateError("");
                        setAttendanceSlotOptionsError("");
                        setAttendanceDraft((draft) => ({ ...draft, lectureDate: event.target.value, timetableSlotId: "" }));
                      }}
                      onBlur={(event) => {
                        const parsed = parseRequiredDateInput(event.target.value, { fieldLabel: "講義日" });
                        if (!parsed.isValid) {
                          setAttendanceDateError(parsed.error);
                        }
                      }}
                    />
                    <p className="text-xs text-slate-500">講義日は `YYYY-MM-DD` 形式で入力してください。</p>
                    {attendanceDateError ? <p className="text-xs text-rose-600">{attendanceDateError}</p> : null}
                  </>
                </Field>
                {attendanceSlotOptionsError ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    <span>{attendanceSlotOptionsError}</span>
                    <IconButton tone="light" className="shrink-0" disabled={savingAttendance} onClick={() => setAttendanceSlotReloadNonce((current) => current + 1)}>
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
                      disabled={savingAttendance}
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
                  <SelectInput
                    value={attendanceDraft?.status || "present"}
                    disabled={savingAttendance}
                    onChange={(event) => setAttendanceDraft((draft) => ({ ...draft, status: event.target.value }))}
                  >
                    {ATTENDANCE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="メモ">
                  <TextArea
                    rows={3}
                    value={attendanceDraft?.memo || ""}
                    disabled={savingAttendance}
                    onChange={(event) => setAttendanceDraft((draft) => ({ ...draft, memo: event.target.value }))}
                    placeholder="補足があればここに"
                  />
                </Field>
                <div className="flex justify-end">
                  <IconButton
                    icon={CheckCircle2}
                    onClick={handleSaveAttendance}
                    disabled={savingAttendance || Boolean(attendanceSlotOptionsError)}
                  >
                    {savingAttendance ? "保存中…" : "保存"}
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
                  <div key={record.id} className="overflow-hidden rounded-2xl border border-slate-200 p-4">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium text-slate-900">{record.lectureDate}</p>
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
                      <div className="flex shrink-0 gap-2 self-start">
                        <IconActionButton onClick={() => startEditAttendance(record)} icon={Pencil} label="出席を編集" disabled={savingAttendance} />
                        <IconActionButton
                          onClick={() => handleDeleteAttendance(record)}
                          icon={Trash2}
                          label="出席を削除"
                          tone="danger"
                          disabled={savingAttendance || pendingAttendanceDeleteIds.has(record.id)}
                        />
                      </div>
                    </div>
                    {record.memo ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{record.memo}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {detailTab === DETAIL_TABS.todos ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900">ToDo を追加</h4>
                <Chip tone="indigo">未完了 {openTodos.length}</Chip>
              </div>
              <form className="mt-4 space-y-3" onSubmit={handleQuickAddTodo}>
                <TextInput
                  aria-label="ToDoタイトル"
                  placeholder="例: レポート提出"
                  value={quickTodoTitle}
                  disabled={savingQuickTodo}
                  onChange={(event) => setQuickTodoTitle(event.target.value)}
                />
                <TextInput
                  aria-label="ToDo期限日"
                  type="text"
                  value={quickTodoDueDate}
                  disabled={savingQuickTodo}
                  placeholder="YYYY-MM-DD"
                  inputMode="numeric"
                  onChange={(event) => {
                    setQuickTodoDueDate(event.target.value);
                    if (quickTodoDueDateError) setQuickTodoDueDateError("");
                  }}
                />
                <p className="text-xs text-slate-500">期限は任意です。入力する場合は `YYYY-MM-DD` 形式で入力してください。</p>
                {quickTodoDueDateError ? <p className="text-xs text-rose-600">{quickTodoDueDateError}</p> : null}
                <IconButton
                  icon={Plus}
                  type="submit"
                  disabled={savingQuickTodo || !quickTodoTitle.trim()}
                  className="w-full justify-center"
                >
                  追加
                </IconButton>
              </form>
            </div>

            <div className="space-y-3">
              {openTodos.length === 0 ? (
                <EmptyState icon={ListTodo} title="未完了の ToDo はありません" />
              ) : (
                openTodos.map((todo) => (
                  <TodoItemCard
                    key={todo.id}
                    todo={todo}
                    pending={pendingTodoIds.has(todo.id)}
                    onToggle={() => handleToggleTodo(todo)}
                    onEdit={() => openTodoEditor(todo)}
                    onDelete={() => handleDeleteTodo(todo)}
                  />
                ))
              )}
            </div>

            {doneTodos.length > 0 ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowCompletedTodos((current) => !current)}
                  className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
                >
                  {showCompletedTodos ? "完了済み ToDo を隠す" : `完了済み ToDo を表示 (${doneTodos.length})`}
                </button>
                {showCompletedTodos ? (
                  doneTodos.map((todo) => (
                    <TodoItemCard
                      key={todo.id}
                      todo={todo}
                      isDone
                      pending={pendingTodoIds.has(todo.id)}
                      onToggle={() => handleToggleTodo(todo)}
                      onEdit={() => openTodoEditor(todo)}
                      onDelete={() => handleDeleteTodo(todo)}
                    />
                  ))
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <TodoFormModal
        open={Boolean(todoEditorInitialValue)}
        subject={header.subject}
        initialValue={todoEditorInitialValue}
        onClose={closeTodoEditor}
        onSave={onSaveTodo}
      />
    </Panel>
  );
}

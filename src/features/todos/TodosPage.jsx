import { useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, ListTodo, Pencil, Trash2 } from "lucide-react";
import { EmptyState, Chip, IconButton, Panel } from "../../components/ui";
import { emptyTodoDraft, formatDate, normalizeDateOnlyInputValue } from "../../lib/utils";
import { TodoFormModal } from "./TodoFormModal";

function TodoRow({ todo, pending = false, onOpenSubject, onToggle, onEdit, onDelete }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="block text-left text-base font-semibold text-slate-900 transition hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {todo.title}
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {todo.subject ? (
              <button
                type="button"
                onClick={() => onOpenSubject(todo.subject.id)}
                disabled={pending}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {todo.subject.name}
              </button>
            ) : null}
            {todo.dueDate ? <Chip tone="amber">{`期限 ${todo.dueDate}`}</Chip> : <Chip tone="slate">期限なし</Chip>}
            <Chip tone={todo.status === "done" ? "emerald" : "indigo"}>{todo.status === "done" ? "完了" : "未完了"}</Chip>
          </div>
          {todo.memo ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{todo.memo}</p>
          ) : null}
          <p className="mt-3 text-xs text-slate-400">更新 {formatDate(todo.updatedAt)}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <IconButton
            tone="light"
            icon={CheckCircle2}
            onClick={onToggle}
            disabled={pending}
            className="w-full justify-center"
          >
            {todo.status === "done" ? "未完了へ" : "完了"}
          </IconButton>
          <IconButton tone="light" icon={Pencil} onClick={onEdit} disabled={pending} className="w-full justify-center">
            編集
          </IconButton>
          <IconButton tone="danger" icon={Trash2} onClick={onDelete} disabled={pending} className="w-full justify-center">
            削除
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export function TodosPage({
  openTodos = [],
  doneTodos = [],
  onOpenSubject = () => {},
  onSaveTodo = async () => {},
  onDeleteTodo = async () => {},
}) {
  const [showCompletedTodos, setShowCompletedTodos] = useState(false);
  const [pendingTodoIds, setPendingTodoIds] = useState(() => new Set());
  const [todoEditorInitialValue, setTodoEditorInitialValue] = useState(null);
  const pendingTodoIdsRef = useRef(new Set());

  const editorSubject = todoEditorInitialValue?.subject || null;
  const summary = useMemo(
    () => ({
      openCount: openTodos.length,
      doneCount: doneTodos.length,
    }),
    [doneTodos.length, openTodos.length],
  );

  function openTodoEditor(todo) {
    setTodoEditorInitialValue({
      ...emptyTodoDraft(todo.subjectId, {
        id: todo.id,
        title: todo.title,
        memo: todo.memo || "",
        dueDate: normalizeDateOnlyInputValue(todo.dueDate),
        status: todo.status,
        completedAt: todo.completedAt || null,
        baseUpdatedAt: todo.updatedAt,
      }),
      subject: todo.subject || null,
    });
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
    } finally {
      endTodoPending(todo.id);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <Panel>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">ToDo 一覧</h3>
              <p className="mt-1 text-sm text-slate-500">今学期の未完了タスクを授業横断で確認できます。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip tone="indigo">{`未完了 ${summary.openCount}`}</Chip>
              <Chip tone="emerald">{`完了済み ${summary.doneCount}`}</Chip>
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-slate-900">未完了タスク</h4>
              <p className="mt-1 text-sm text-slate-500">期限と授業を横断して、今やるべきものをまとめています。</p>
            </div>
            <Chip tone="indigo">{`${summary.openCount}件`}</Chip>
          </div>
          <div className="mt-4 space-y-3">
            {openTodos.length === 0 ? (
              <EmptyState icon={ListTodo} title="未完了の ToDo はありません" />
            ) : (
              openTodos.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  pending={pendingTodoIds.has(todo.id)}
                  onOpenSubject={onOpenSubject}
                  onToggle={() => handleToggleTodo(todo)}
                  onEdit={() => openTodoEditor(todo)}
                  onDelete={() => handleDeleteTodo(todo)}
                />
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <button
            type="button"
            onClick={() => setShowCompletedTodos((current) => !current)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <div>
              <h4 className="text-base font-semibold text-slate-900">完了済みタスク</h4>
              <p className="mt-1 text-sm text-slate-500">必要なときだけ展開して確認します。</p>
            </div>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
              {showCompletedTodos ? "閉じる" : `表示 (${summary.doneCount})`}
              {showCompletedTodos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
          {showCompletedTodos ? (
            <div className="mt-4 space-y-3">
              {doneTodos.length === 0 ? (
                <EmptyState icon={CheckCircle2} title="完了済みの ToDo はありません" />
              ) : (
                doneTodos.map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    pending={pendingTodoIds.has(todo.id)}
                    onOpenSubject={onOpenSubject}
                    onToggle={() => handleToggleTodo(todo)}
                    onEdit={() => openTodoEditor(todo)}
                    onDelete={() => handleDeleteTodo(todo)}
                  />
                ))
              )}
            </div>
          ) : null}
        </Panel>
      </div>

      <TodoFormModal
        open={Boolean(todoEditorInitialValue)}
        subject={editorSubject}
        initialValue={todoEditorInitialValue}
        onClose={closeTodoEditor}
        onSave={onSaveTodo}
      />
    </>
  );
}

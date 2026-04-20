import { createAppError } from "../../lib/errors";
import {
  isValidDateOnly,
  normalizeDateOnlyInputValue,
  nowIso,
  sortTodos,
  uid,
} from "../../lib/utils";
import { getDb } from "../schema";

function normalizeTodoStatus(value) {
  if (value === "open" || value === "done") return value;
  throw createAppError("INVALID_TODO_STATUS", "ToDo の状態が不正です。");
}

function normalizeDueDate(value) {
  const normalized = normalizeDateOnlyInputValue(value);
  if (!value) return "";
  if (!isValidDateOnly(normalized)) {
    throw createAppError("INVALID_TODO_DUE_DATE", "期限日は正しい日付で入力してください。");
  }
  return normalized;
}

function sanitizeTitle(value) {
  const title = (value || "").trim();
  if (!title) {
    throw createAppError("INVALID_TODO_TITLE", "ToDo のタイトルは必須です。");
  }
  return title;
}

function normalizeTodo(item) {
  return {
    ...item,
    dueDate: normalizeDateOnlyInputValue(item.dueDate),
  };
}

export async function loadSubjectTodos(subjectId) {
  const db = await getDb();
  const items = await db.getAllFromIndex("todo_items", "bySubjectId", subjectId);
  return sortTodos(items.map(normalizeTodo));
}

export async function countOpenTodosBySubject(subjectId) {
  const db = await getDb();
  return db.countFromIndex("todo_items", "bySubjectStatus", [subjectId, "open"]);
}

export async function countDoneTodosBySubject(subjectId) {
  const db = await getDb();
  return db.countFromIndex("todo_items", "bySubjectStatus", [subjectId, "done"]);
}

export async function countOpenTodosByTerm(termKey) {
  const db = await getDb();
  return db.countFromIndex("todo_items", "byTermStatus", [termKey, "open"]);
}

export async function saveTodo(todoDraft) {
  const title = sanitizeTitle(todoDraft.title);
  const dueDate = normalizeDueDate(todoDraft.dueDate);
  const status = normalizeTodoStatus(todoDraft.status || "open");

  const db = await getDb();
  const tx = db.transaction(["todo_items", "subjects"], "readwrite");
  const todoStore = tx.objectStore("todo_items");
  const existing = todoDraft.id ? await todoStore.get(todoDraft.id) : null;
  if (todoDraft.id && !existing) {
    throw createAppError("STALE_DRAFT", "この ToDo は既に削除されています。開き直してから保存してください。");
  }
  if (todoDraft.id && todoDraft.baseUpdatedAt && existing.updatedAt !== todoDraft.baseUpdatedAt) {
    throw createAppError("STALE_UPDATE", "この ToDo は別の画面で更新されています。開き直してから保存してください。");
  }

  const subject = await tx.objectStore("subjects").get(todoDraft.subjectId);
  if (!subject) {
    throw createAppError("NOT_FOUND", "授業が見つかりませんでした。");
  }

  const timestamp = nowIso();
  const completedAt =
    status === "done"
      ? existing?.status === "done"
        ? existing.completedAt || timestamp
        : timestamp
      : null;

  await todoStore.put({
    id: todoDraft.id || uid(),
    subjectId: todoDraft.subjectId,
    termKey: subject.termKey,
    title,
    memo: todoDraft.memo || "",
    dueDate,
    status,
    completedAt,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  });
  await tx.done;
}

export async function deleteTodo(todoId) {
  const db = await getDb();
  const existing = await db.get("todo_items", todoId);
  if (!existing) {
    throw createAppError("STALE_DRAFT", "この ToDo は既に削除されています。");
  }
  await db.delete("todo_items", todoId);
}

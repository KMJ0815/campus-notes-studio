import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteAppDb, resetDbConnection, ensureSeedData } from "../schema";
import {
  countDoneTodosBySubject,
  countOpenTodosBySubject,
  countOpenTodosByTerm,
  deleteTodo,
  loadSubjectTodos,
  saveTodo,
} from "./todos";
import { saveSubject } from "./subjects";

describe("todos repository", () => {
  let subjectId = "";

  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
    await ensureSeedData();
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "国際関係論",
      teacherName: "",
      room: "",
      color: "#4f46e5",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["mon-1"],
    });
    subjectId = subject.id;
  });

  afterEach(async () => {
    await deleteAppDb();
    resetDbConnection();
  });

  it("creates and sorts open todos by due date", async () => {
    await saveTodo({
      subjectId,
      title: "発表準備",
      memo: "",
      dueDate: "",
      status: "open",
    });
    await saveTodo({
      subjectId,
      title: "レポート提出",
      memo: "",
      dueDate: "2026-04-20",
      status: "open",
    });

    const todos = await loadSubjectTodos(subjectId);
    expect(todos.map((todo) => todo.title)).toEqual(["レポート提出", "発表準備"]);
    expect(await countOpenTodosBySubject(subjectId)).toBe(2);
    expect(await countOpenTodosByTerm("2026-spring")).toBe(2);
  });

  it("updates status and tracks done/open counts", async () => {
    await saveTodo({
      subjectId,
      title: "資料印刷",
      memo: "",
      dueDate: "2026-04-19",
      status: "open",
    });

    const [existing] = await loadSubjectTodos(subjectId);
    await saveTodo({
      ...existing,
      baseUpdatedAt: existing.updatedAt,
      status: "done",
    });

    const [updated] = await loadSubjectTodos(subjectId);
    expect(updated.status).toBe("done");
    expect(updated.completedAt).toBeTruthy();
    expect(await countOpenTodosBySubject(subjectId)).toBe(0);
    expect(await countDoneTodosBySubject(subjectId)).toBe(1);
  });

  it("rejects stale updates and stale deletes", async () => {
    await saveTodo({
      subjectId,
      title: "提出確認",
      memo: "",
      dueDate: "",
      status: "open",
    });

    const [existing] = await loadSubjectTodos(subjectId);
    await deleteTodo(existing.id);

    await expect(
      saveTodo({
        ...existing,
        baseUpdatedAt: existing.updatedAt,
        title: "提出確認 更新",
      }),
    ).rejects.toMatchObject({ code: "STALE_DRAFT" });

    await expect(deleteTodo(existing.id)).rejects.toMatchObject({ code: "STALE_DRAFT" });
  });

  it("rejects invalid titles and invalid due dates", async () => {
    await expect(
      saveTodo({
        subjectId,
        title: "   ",
        memo: "",
        dueDate: "",
        status: "open",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TODO_TITLE" });

    await expect(
      saveTodo({
        subjectId,
        title: "課題",
        memo: "",
        dueDate: "2026-04-99",
        status: "open",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TODO_DUE_DATE" });
  });
});

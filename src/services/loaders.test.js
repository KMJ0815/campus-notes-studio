import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/repositories/notes", async () => {
  const actual = await vi.importActual("../db/repositories/notes");
  return {
    ...actual,
    loadSubjectNotes: vi.fn(actual.loadSubjectNotes),
  };
});

import { ensureSeedData, deleteAppDb, getDb, resetDbConnection } from "../db/schema";
import { archiveSubject, saveSubject } from "../db/repositories/subjects";
import { saveTodo } from "../db/repositories/todos";
import { loadSubjectNotes } from "../db/repositories/notes";
import { loadDashboardSummary, loadSubjectHeader, loadTodosPageData } from "./loaders";

describe("loaders", () => {
  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
    await ensureSeedData();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await deleteAppDb();
    resetDbConnection();
  });

  it("loads dashboard aggregates without per-subject note fetches", async () => {
    const [subjectA, subjectB] = await Promise.all([
      saveSubject({
        termKey: "2026-spring",
        name: "国際関係論",
        teacherName: "",
        room: "",
        color: "#4f46e5",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["mon-1"],
      }),
      saveSubject({
        termKey: "2026-spring",
        name: "統計学",
        teacherName: "",
        room: "",
        color: "#0f172a",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["tue-1"],
      }),
    ]);

    const db = await getDb();
    const getAllSpy = vi.spyOn(db, "getAll");
    await Promise.all([
      db.put("notes", {
        id: "note-1",
        subjectId: subjectA.id,
        termKey: "2026-spring",
        title: "第1回",
        bodyText: "summary",
        lectureDate: "2026-04-20",
        createdAt: "2026-04-20T09:00:00.000Z",
        updatedAt: "2026-04-20T09:00:00.000Z",
      }),
      db.put("notes", {
        id: "note-2",
        subjectId: subjectB.id,
        termKey: "2026-spring",
        title: "第2回",
        bodyText: "summary",
        lectureDate: "2026-04-21",
        createdAt: "2026-04-21T09:00:00.000Z",
        updatedAt: "2026-04-21T09:00:00.000Z",
      }),
      db.put("material_meta", {
        id: "material-1",
        subjectId: subjectA.id,
        termKey: "2026-spring",
        displayName: "lecture.pdf",
        mimeType: "application/pdf",
        fileExt: "pdf",
        sizeBytes: 512,
        note: "",
        createdAt: "2026-04-20T09:00:00.000Z",
        updatedAt: "2026-04-20T09:00:00.000Z",
      }),
      db.put("attendance", {
        id: "attendance-1",
        subjectId: subjectB.id,
        termKey: "2026-spring",
        lectureDate: "2026-04-21",
        timetableSlotId: "",
        status: "present",
        memo: "",
        createdAt: "2026-04-21T09:00:00.000Z",
        updatedAt: "2026-04-21T09:00:00.000Z",
      }),
      saveTodo({
        subjectId: subjectA.id,
        title: "レポート提出",
        memo: "",
        dueDate: "2026-04-22",
        status: "open",
      }),
    ]);

    const summary = await loadDashboardSummary("2026-spring");

    expect(summary.activeSubjectsCount).toBe(2);
    expect(summary.notesCount).toBe(2);
    expect(summary.materialsCount).toBe(1);
    expect(summary.attendanceCount).toBe(1);
    expect(summary.openTodosCount).toBe(1);
    expect(summary.recentNotes).toHaveLength(2);
    expect(loadSubjectNotes).not.toHaveBeenCalled();
    expect(getAllSpy).not.toHaveBeenCalledWith("notes");
    expect(getAllSpy).not.toHaveBeenCalledWith("material_meta");
    expect(getAllSpy).not.toHaveBeenCalledWith("attendance");
  });

  it("excludes archived-subject todos from the dashboard open todo count", async () => {
    const [activeSubject, archivedSubject] = await Promise.all([
      saveSubject({
        termKey: "2026-spring",
        name: "国際関係論",
        teacherName: "",
        room: "",
        color: "#4f46e5",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["mon-1"],
      }),
      saveSubject({
        termKey: "2026-spring",
        name: "統計学",
        teacherName: "",
        room: "",
        color: "#0f172a",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["tue-1"],
      }),
    ]);
    await archiveSubject(archivedSubject.id);

    await Promise.all([
      saveTodo({
        subjectId: activeSubject.id,
        title: "現役の課題",
        memo: "",
        dueDate: "2026-04-22",
        status: "open",
      }),
      saveTodo({
        subjectId: archivedSubject.id,
        title: "アーカイブ済みの課題",
        memo: "",
        dueDate: "2026-04-23",
        status: "open",
      }),
    ]);

    const summary = await loadDashboardSummary("2026-spring");

    expect(summary.activeSubjectsCount).toBe(1);
    expect(summary.openTodosCount).toBe(1);
  });

  it("loads todo counts into the subject header", async () => {
    const subject = await saveSubject({
      termKey: "2026-spring",
      name: "統計学",
      teacherName: "",
      room: "",
      color: "#0f172a",
      memo: "",
      isArchived: false,
      selectedSlotKeys: ["tue-1"],
    });

    await Promise.all([
      saveTodo({
        subjectId: subject.id,
        title: "小テスト対策",
        memo: "",
        dueDate: "2026-04-21",
        status: "open",
      }),
      saveTodo({
        subjectId: subject.id,
        title: "配布資料を読む",
        memo: "",
        dueDate: "",
        status: "done",
      }),
    ]);

    const header = await loadSubjectHeader(subject.id);
    expect(header.openTodosCount).toBe(1);
    expect(header.doneTodosCount).toBe(1);
  });

  it("loads only active-subject todos for the standalone todos page", async () => {
    const [activeSubject, archivedSubject] = await Promise.all([
      saveSubject({
        termKey: "2026-spring",
        name: "統計学",
        teacherName: "",
        room: "",
        color: "#0f172a",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["tue-1"],
      }),
      saveSubject({
        termKey: "2026-spring",
        name: "国際関係論",
        teacherName: "",
        room: "",
        color: "#4f46e5",
        memo: "",
        isArchived: false,
        selectedSlotKeys: ["wed-1"],
      }),
    ]);
    await archiveSubject(archivedSubject.id);

    await Promise.all([
      saveTodo({
        subjectId: activeSubject.id,
        title: "レポート提出",
        memo: "",
        dueDate: "2026-04-22",
        status: "open",
      }),
      saveTodo({
        subjectId: activeSubject.id,
        title: "参考文献を読む",
        memo: "",
        dueDate: "",
        status: "done",
      }),
    ]);
    await saveTodo({
      subjectId: archivedSubject.id,
      title: "アーカイブ済みの課題",
      memo: "",
      dueDate: "2026-04-23",
      status: "open",
    });

    const todoPageData = await loadTodosPageData("2026-spring");

    expect(todoPageData.openTodos.map((todo) => todo.title)).toEqual(["レポート提出"]);
    expect(todoPageData.doneTodos.map((todo) => todo.title)).toEqual(["参考文献を読む"]);
    expect(todoPageData.openTodos[0].subject?.name).toBe("統計学");
  });
});

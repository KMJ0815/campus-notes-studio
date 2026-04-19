import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/repositories/notes", async () => {
  const actual = await vi.importActual("../db/repositories/notes");
  return {
    ...actual,
    loadSubjectNotes: vi.fn(actual.loadSubjectNotes),
  };
});

import { ensureSeedData, deleteAppDb, getDb, resetDbConnection } from "../db/schema";
import { saveSubject } from "../db/repositories/subjects";
import { loadSubjectNotes } from "../db/repositories/notes";
import { loadDashboardSummary } from "./loaders";

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
    ]);

    const summary = await loadDashboardSummary("2026-spring");

    expect(summary.activeSubjectsCount).toBe(2);
    expect(summary.notesCount).toBe(2);
    expect(summary.materialsCount).toBe(1);
    expect(summary.attendanceCount).toBe(1);
    expect(summary.recentNotes).toHaveLength(2);
    expect(loadSubjectNotes).not.toHaveBeenCalled();
    expect(getAllSpy).not.toHaveBeenCalledWith("notes");
    expect(getAllSpy).not.toHaveBeenCalledWith("material_meta");
    expect(getAllSpy).not.toHaveBeenCalledWith("attendance");
  });
});

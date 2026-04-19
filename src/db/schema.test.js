import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDB } from "idb";
import { DB_NAME, SETTINGS_ID } from "../lib/constants";
import { deleteAppDb, getDb, resetDbConnection } from "./schema";

async function createV1Database() {
  const db = await openDB(DB_NAME, 1, {
    upgrade(upgradeDb) {
      upgradeDb.createObjectStore("settings", { keyPath: "id" });
      upgradeDb.createObjectStore("subjects", { keyPath: "id" });
      upgradeDb.createObjectStore("slots", { keyPath: "id" });
      upgradeDb.createObjectStore("notes", { keyPath: "id" });
      upgradeDb.createObjectStore("attendance", { keyPath: "id" });
      upgradeDb.createObjectStore("material_meta", { keyPath: "id" });
      upgradeDb.createObjectStore("material_files", { keyPath: "id" });
    },
  });

  await db.put("settings", {
    id: SETTINGS_ID,
    currentTermKey: "2026-spring",
    termLabel: "2026年度 春学期",
    periods: [
      { id: "old-1", periodNo: 1, label: "1限", startTime: "9:00", endTime: "10:40:00", isEnabled: true },
    ],
    exportIncludeFiles: true,
    updatedAt: "2026-04-17T12:00:00.000Z",
  });
  await db.put("notes", {
    id: "note-1",
    subjectId: "subject-1",
    title: "メモ",
    bodyText: "本文",
    lectureDate: "2026-04-18T00:00:00.000Z",
    createdAt: "2026-04-17T12:00:00.000Z",
    updatedAt: "2026-04-17T12:00:00.000Z",
  });
  await db.put("attendance", {
    id: "attendance-1",
    subjectId: "subject-1",
    lectureDate: "2026-04-18",
    timetableSlotId: null,
    status: "present",
    memo: "",
    createdAt: "2026-04-17T12:00:00.000Z",
    updatedAt: "2026-04-17T12:00:00.000Z",
  });
  await db.put("material_meta", {
    id: "material-1",
    subjectId: "subject-1",
    displayName: "lecture.pdf",
    mimeType: "application/pdf",
    fileExt: "pdf",
    sizeBytes: 123,
    note: "",
    createdAt: "2026-04-17T12:00:00.000Z",
    updatedAt: "2026-04-17T12:00:00.000Z",
  });
  await db.put("subjects", {
    id: "subject-1",
    termKey: "2026-spring",
    name: "国際関係論",
    teacherName: "",
    room: "",
    color: "#4f46e5",
    memo: "",
    isArchived: false,
    createdAt: "2026-04-17T12:00:00.000Z",
    updatedAt: "2026-04-17T12:00:00.000Z",
  });
  await db.put("slots", {
    id: "slot-1",
    termKey: "2026-spring",
    subjectId: "subject-1",
    weekday: "mon",
    periodNo: 1,
    createdAt: "2026-04-17T12:00:00.000Z",
    updatedAt: "2026-04-17T12:00:00.000Z",
  });
  db.close();
}

describe("schema migration", () => {
  beforeEach(async () => {
    await deleteAppDb();
    resetDbConnection();
  });

  afterEach(async () => {
    await deleteAppDb();
    resetDbConnection();
  });

  it("migrates settings.periods into period_definitions and stabilizes slots", async () => {
    await createV1Database();
    resetDbConnection();

    const db = await getDb();
    const settings = await db.get("settings", SETTINGS_ID);
    const periods = await db.getAllFromIndex("period_definitions", "byTermKey", "2026-spring");
    const slot = await db.get("slots", "slot-1");
    const note = await db.get("notes", "note-1");
    const attendance = await db.get("attendance", "attendance-1");
    const material = await db.get("material_meta", "material-1");

    expect(settings.periods).toBeUndefined();
    expect(periods).toHaveLength(1);
    expect(periods[0].id).toBe("period:2026-spring:1");
    expect(periods[0].periodNo).toBe(1);
    expect(periods[0].startTime).toBe("09:00");
    expect(periods[0].endTime).toBe("10:40");
    expect(slot.activeSlotKey).toBe("2026-spring:mon:1");
    expect(slot.isArchived).toBe(false);
    expect(note.lectureDate).toBe("2026-04-18");
    expect(note.termKey).toBe("2026-spring");
    expect(attendance.timetableSlotId).toBe("");
    expect(attendance.termKey).toBe("2026-spring");
    expect(material.termKey).toBe("2026-spring");
    expect(await db.getAllFromIndex("notes", "byTermKey", "2026-spring")).toHaveLength(1);
    expect(await db.getAllFromIndex("attendance", "byTermKey", "2026-spring")).toHaveLength(1);
    expect(await db.getAllFromIndex("material_meta", "byTermKey", "2026-spring")).toHaveLength(1);
  });
});

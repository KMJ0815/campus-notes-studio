import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureSeedData, deleteAppDb, getDb, resetDbConnection } from "../schema";
import { deleteNote, loadSubjectNotes, saveNote } from "./notes";
import { saveSubject } from "./subjects";

describe("notes repository", () => {
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

  it("rejects missing lecture dates", async () => {
    await expect(
      saveNote({
        subjectId,
        title: "第1回",
        bodyText: "summary",
        lectureDate: "",
      }),
    ).rejects.toMatchObject({ code: "INVALID_NOTE_DATE" });
  });

  it("rejects invalid lecture dates that are not strict YYYY-MM-DD values", async () => {
    for (const lectureDate of ["2026-02-31", "2026-02-29", "2026/04/21", "2026-4-1"]) {
      await expect(
        saveNote({
          subjectId,
          title: "第1回",
          bodyText: "summary",
          lectureDate,
        }),
      ).rejects.toMatchObject({ code: "INVALID_NOTE_DATE" });
    }
  });

  it("persists lectureDate exactly as entered", async () => {
    await saveNote({
      subjectId,
      title: "第1回",
      bodyText: "summary",
      lectureDate: "2026-04-18",
    });

    const db = await getDb();
    const notes = await db.getAll("notes");

    expect(notes).toHaveLength(1);
    expect(notes[0].lectureDate).toBe("2026-04-18");
    expect(notes[0].termKey).toBe("2026-spring");
  });

  it("normalizes stored lecture dates on read", async () => {
    const db = await getDb();
    await db.put("notes", {
      id: "note-legacy",
      subjectId,
      termKey: "2026-spring",
      title: "legacy",
      bodyText: "",
      lectureDate: "2026-04-18T00:00:00.000Z",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });

    const notes = await loadSubjectNotes(subjectId);
    expect(notes[0].lectureDate).toBe("2026-04-18");
  });

  it("rejects stale note drafts instead of recreating deleted notes", async () => {
    await saveNote({
      subjectId,
      title: "第1回",
      bodyText: "summary",
      lectureDate: "2026-04-18",
    });

    const [existing] = await loadSubjectNotes(subjectId);
    await deleteNote(existing.id);

    await expect(
      saveNote({
        id: existing.id,
        subjectId,
        title: "第1回 編集",
        bodyText: "updated",
        lectureDate: "2026-04-19",
      }),
    ).rejects.toMatchObject({ code: "STALE_DRAFT" });

    expect(await loadSubjectNotes(subjectId)).toHaveLength(0);
  });

  it("rejects deleting an already removed note", async () => {
    await expect(deleteNote("missing-note")).rejects.toMatchObject({ code: "STALE_DRAFT" });
  });
});
